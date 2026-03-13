import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PlatformConnector,
  PlatformConnectionData,
  HealthCheckResult,
  FetchResult,
  ContentItemInput,
} from '@omniclip/shared';
import { ConnectorError } from '../interfaces/connector-error';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Daily quota limit for YouTube Data API v3 */
const DAILY_QUOTA_LIMIT = 10_000;

/**
 * YouTube connector — fetches subscription channel videos via YouTube Data API v3.
 * Implements PlatformConnector interface for server-side (API) collection.
 *
 * OAuth 2.0 flow:
 * - Access tokens expire in ~1 hour
 * - Refresh tokens are long-lived
 * - Token refresh is handled transparently in fetchContent/healthCheck
 *
 * Quota tracking:
 * - activities.list costs 1 unit per call
 * - subscriptions.list costs 1 unit per call
 * - videos.list costs 1 unit per call
 */
@Injectable()
export class YouTubeConnector implements PlatformConnector {
  private readonly logger = new Logger(YouTubeConnector.name);

  readonly platform = 'youtube' as const;
  readonly type = 'api' as const;

  constructor(private readonly configService: ConfigService) {}

  // ── PlatformConnector interface ──

  /**
   * Verify that the YouTube OAuth token is valid.
   */
  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    const tokens = this.extractTokens(connection);
    if (!tokens) {
      throw new ConnectorError(
        'youtube',
        'AUTH_EXPIRED',
        'No OAuth tokens configured — connect YouTube via OAuth',
        false,
      );
    }

    try {
      // Test with a lightweight API call: list 1 subscription
      const response = await this.youtubeFetch(
        '/subscriptions?part=id&mine=true&maxResults=1',
        tokens.access_token,
      );

      if (response.status === 401) {
        // Try refreshing the token
        const newTokens = await this.refreshAccessToken(tokens.refresh_token);
        if (!newTokens) {
          throw new ConnectorError(
            'youtube',
            'AUTH_EXPIRED',
            'YouTube OAuth token expired and refresh failed',
            false,
          );
        }

        // Re-test with new token
        const retryResponse = await this.youtubeFetch(
          '/subscriptions?part=id&mine=true&maxResults=1',
          newTokens.access_token,
        );

        if (!retryResponse.ok) {
          return {
            status: 'unhealthy',
            message: `YouTube API returned ${retryResponse.status} after token refresh`,
          };
        }

        return {
          status: 'healthy',
          message: 'YouTube API accessible (token was refreshed)',
          details: { api_version: 'v3' },
        };
      }

      if (!response.ok) {
        if (response.status === 403) {
          const body = await response.json().catch(() => ({}));
          const reason = (body as { error?: { errors?: Array<{ reason?: string }> } })?.error
            ?.errors?.[0]?.reason;
          if (reason === 'quotaExceeded') {
            return {
              status: 'degraded',
              message: 'YouTube API quota exceeded for today',
              details: { rate_limit_remaining: 0 },
            };
          }
        }
        return {
          status: 'unhealthy',
          message: `YouTube API returned ${response.status}`,
        };
      }

      return {
        status: 'healthy',
        message: 'YouTube API accessible',
        details: { api_version: 'v3' },
      };
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      return {
        status: 'unhealthy',
        message: `YouTube API unreachable: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch new videos from subscribed channels.
   * Strategy: Get subscriptions → fetch activities per channel → enrich with video details.
   */
  async fetchContent(connection: PlatformConnectionData, since: Date | null): Promise<FetchResult> {
    let tokens = this.extractTokens(connection);
    if (!tokens) {
      throw new ConnectorError('youtube', 'AUTH_EXPIRED', 'No OAuth tokens configured', false);
    }

    let apiCalls = 0;
    const allItems: ContentItemInput[] = [];

    // Ensure token is fresh
    const testResponse = await this.youtubeFetch(
      '/subscriptions?part=id&mine=true&maxResults=1',
      tokens.access_token,
    );
    apiCalls++;

    if (testResponse.status === 401) {
      const newTokens = await this.refreshAccessToken(tokens.refresh_token);
      if (!newTokens) {
        throw new ConnectorError(
          'youtube',
          'AUTH_EXPIRED',
          'YouTube OAuth token expired and refresh failed',
          false,
        );
      }
      tokens = { ...tokens, access_token: newTokens.access_token };
    }

    this.handleErrorResponse(testResponse);

    // 1. Get subscriptions
    let subscriptionPageToken: string | undefined;
    const channelIds: string[] = [];

    do {
      const subUrl = `/subscriptions?part=snippet&mine=true&maxResults=50${
        subscriptionPageToken ? `&pageToken=${subscriptionPageToken}` : ''
      }`;

      const subResponse = await this.youtubeFetch(subUrl, tokens.access_token);
      apiCalls++;
      this.handleErrorResponse(subResponse);

      const subData = (await subResponse.json()) as {
        items?: Array<{ snippet?: { resourceId?: { channelId?: string } } }>;
        nextPageToken?: string;
      };

      if (subData.items) {
        for (const sub of subData.items) {
          const channelId = sub.snippet?.resourceId?.channelId;
          if (channelId) channelIds.push(channelId);
        }
      }

      subscriptionPageToken = subData.nextPageToken;

      // Limit to first 100 subscriptions to conserve quota
      if (channelIds.length >= 100) break;
    } while (subscriptionPageToken);

    // 2. Fetch activities per channel (batch: up to 50 channels)
    // Use the activities endpoint per channel
    const publishedAfter = since
      ? since.toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Default: last 7 days

    const videoIds: string[] = [];

    for (const channelId of channelIds) {
      if (apiCalls >= DAILY_QUOTA_LIMIT - 10) {
        this.logger.warn('Approaching YouTube API quota limit, stopping early');
        break;
      }

      const actUrl = `/activities?part=snippet,contentDetails&channelId=${channelId}&maxResults=10&publishedAfter=${publishedAfter}`;
      const actResponse = await this.youtubeFetch(actUrl, tokens.access_token);
      apiCalls++;

      if (!actResponse.ok) {
        this.logger.warn(
          `Failed to fetch activities for channel ${channelId}: ${actResponse.status}`,
        );
        continue;
      }

      const actData = (await actResponse.json()) as { items?: unknown[] };

      if (actData.items) {
        const parsed = this.parseActivities(actData.items);
        for (const item of parsed) {
          // Extract videoId from external_id (yt-{videoId})
          const videoId = item.external_id.replace('yt-', '');
          if (!videoIds.includes(videoId)) {
            videoIds.push(videoId);
            allItems.push(item);
          }
        }
      }
    }

    // 3. Enrich with video statistics (batch: up to 50 per call)
    if (videoIds.length > 0) {
      for (let i = 0; i < videoIds.length; i += 50) {
        if (apiCalls >= DAILY_QUOTA_LIMIT - 5) break;

        const batch = videoIds.slice(i, i + 50);
        const vidUrl = `/videos?part=snippet,contentDetails,statistics&id=${batch.join(',')}`;
        const vidResponse = await this.youtubeFetch(vidUrl, tokens.access_token);
        apiCalls++;

        if (!vidResponse.ok) {
          this.logger.warn(`Failed to fetch video details: ${vidResponse.status}`);
          continue;
        }

        const vidData = (await vidResponse.json()) as { items?: unknown[] };
        if (vidData.items) {
          const enriched = this.parseVideos(vidData.items);
          // Merge enriched data into allItems
          for (const enrichedItem of enriched) {
            const existing = allItems.find((a) => a.external_id === enrichedItem.external_id);
            if (existing) {
              // Overwrite with enriched metadata
              Object.assign(existing.metadata, enrichedItem.metadata);
            }
          }
        }
      }
    }

    return {
      items: allItems,
      has_more: false,
      metadata: {
        api_calls_made: apiCalls,
      },
    };
  }

  /**
   * Parse raw YouTube API responses into normalized ContentItemInputs.
   * Supports 'activities' and 'videos' response types.
   */
  parseResponse(rawData: unknown): ContentItemInput[] {
    if (!rawData || typeof rawData !== 'object') return [];

    const data = rawData as { type?: string; data?: unknown[] };

    if (data.type === 'activities' && Array.isArray(data.data)) {
      return this.parseActivities(data.data);
    }

    if (data.type === 'videos' && Array.isArray(data.data)) {
      return this.parseVideos(data.data);
    }

    return [];
  }

  // ── Private: parsing helpers ──

  private parseActivities(activities: unknown[]): ContentItemInput[] {
    const items: ContentItemInput[] = [];

    for (const raw of activities) {
      const activity = raw as {
        id?: string;
        snippet?: {
          publishedAt?: string;
          channelId?: string;
          title?: string;
          description?: string;
          thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
          channelTitle?: string;
          type?: string;
        };
        contentDetails?: {
          upload?: { videoId?: string };
        };
      };

      // Only process upload activities
      if (activity.snippet?.type !== 'upload') continue;

      const videoId = activity.contentDetails?.upload?.videoId;
      if (!videoId) continue;

      const snippet = activity.snippet;
      const thumbnailUrl = this.extractThumbnail(snippet.thumbnails);

      items.push({
        external_id: `yt-${videoId}`,
        content_type: 'video',
        title: snippet.title || 'Untitled Video',
        body: snippet.description || null,
        media_urls: thumbnailUrl ? [thumbnailUrl] : [],
        metadata: {
          channel_id: snippet.channelId || null,
        },
        author_name: snippet.channelTitle || null,
        author_url: snippet.channelId
          ? `https://www.youtube.com/channel/${snippet.channelId}`
          : null,
        original_url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(),
      });
    }

    return items;
  }

  private parseVideos(videos: unknown[]): ContentItemInput[] {
    const items: ContentItemInput[] = [];

    for (const raw of videos) {
      const video = raw as {
        id?: string;
        snippet?: {
          publishedAt?: string;
          channelId?: string;
          title?: string;
          description?: string;
          thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
          channelTitle?: string;
          tags?: string[];
          categoryId?: string;
        };
        contentDetails?: {
          duration?: string;
        };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      };

      const videoId = video.id;
      if (!videoId) continue;

      const snippet = video.snippet || {};
      const stats = video.statistics || {};
      const thumbnailUrl = this.extractThumbnail(snippet.thumbnails);

      items.push({
        external_id: `yt-${videoId}`,
        content_type: 'video',
        title: snippet.title || 'Untitled Video',
        body: snippet.description || null,
        media_urls: thumbnailUrl ? [thumbnailUrl] : [],
        metadata: {
          channel_id: snippet.channelId || null,
          duration_seconds: this.parseIsoDuration(video.contentDetails?.duration),
          view_count: parseInt(stats.viewCount || '0', 10),
          like_count: parseInt(stats.likeCount || '0', 10),
          comment_count: parseInt(stats.commentCount || '0', 10),
          thumbnail_url: thumbnailUrl || null,
          tags: snippet.tags || [],
        },
        author_name: snippet.channelTitle || null,
        author_url: snippet.channelId
          ? `https://www.youtube.com/channel/${snippet.channelId}`
          : null,
        original_url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(),
      });
    }

    return items;
  }

  // ── Private: OAuth helpers ──

  private extractTokens(
    connection: PlatformConnectionData,
  ): { access_token: string; refresh_token: string; token_expiry?: string } | null {
    if (!connection.auth_data) return null;
    const accessToken = connection.auth_data.access_token as string | undefined;
    const refreshToken = connection.auth_data.refresh_token as string | undefined;
    if (!accessToken || !refreshToken) return null;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expiry: connection.auth_data.token_expiry as string | undefined,
    };
  }

  /**
   * Refresh an expired OAuth access token using the refresh token.
   * Returns new tokens or null if refresh fails.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number } | null> {
    const clientId = this.configService.get<string>('youtube.clientId');
    const clientSecret = this.configService.get<string>('youtube.clientSecret');

    if (!clientId || !clientSecret) {
      this.logger.error('YouTube OAuth client credentials not configured');
      return null;
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        this.logger.error(`Token refresh failed: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      return data;
    } catch (error) {
      this.logger.error(`Token refresh error: ${(error as Error).message}`);
      return null;
    }
  }

  // ── Private: HTTP helper ──

  private async youtubeFetch(path: string, accessToken: string): Promise<Response> {
    const url = path.startsWith('http') ? path : `${YOUTUBE_API_BASE}${path}`;

    return fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  }

  private handleErrorResponse(response: Response): void {
    if (response.ok) return;

    if (response.status === 401) {
      throw new ConnectorError(
        'youtube',
        'AUTH_EXPIRED',
        'YouTube OAuth token is invalid or expired',
        false,
      );
    }

    if (response.status === 403) {
      throw new ConnectorError(
        'youtube',
        'RATE_LIMITED',
        'YouTube API quota exceeded or forbidden',
        true,
      );
    }

    throw new ConnectorError(
      'youtube',
      'PLATFORM_ERROR',
      `YouTube API returned ${response.status}`,
      response.status >= 500,
    );
  }

  // ── Private: utility helpers ──

  /**
   * Extract the best available thumbnail URL from a thumbnails object.
   * Preference order: high > medium > default > any first key.
   */
  private extractThumbnail(
    thumbnails?: Record<string, { url?: string; width?: number; height?: number }>,
  ): string | null {
    if (!thumbnails) return null;

    for (const key of ['high', 'medium', 'default']) {
      if (thumbnails[key]?.url) return thumbnails[key].url!;
    }

    // Fallback: first available thumbnail
    const firstKey = Object.keys(thumbnails)[0];
    return firstKey ? thumbnails[firstKey]?.url || null : null;
  }

  /**
   * Parse an ISO 8601 duration string (e.g., "PT10M30S") into seconds.
   */
  private parseIsoDuration(duration?: string): number {
    if (!duration) return 0;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }
}
