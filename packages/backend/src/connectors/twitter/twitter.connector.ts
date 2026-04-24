import { Injectable, Logger } from '@nestjs/common';
import type {
  ContentItemInput,
  FetchResult,
  HealthCheckResult,
  PlatformConnectionData,
  PlatformConnector,
} from '@omniclip/shared';
import { Rettiwt } from 'rettiwt-api';
import type { ITweet } from 'rettiwt-api';
import { ConnectorError } from '../interfaces/connector-error';
import { buildApiKeyFromCookies } from './twitter.utils';

@Injectable()
export class TwitterConnector implements PlatformConnector {
  private readonly logger = new Logger(TwitterConnector.name);

  readonly platform = 'twitter' as const;
  readonly type = 'api' as const;

  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    let apiKey: string;

    try {
      apiKey = this.extractApiKey(connection);
    } catch (error) {
      if (error instanceof ConnectorError) {
        return {
          status: 'unhealthy',
          message: error.message,
        };
      }

      throw error;
    }

    try {
      const rettiwt = this.createClient(apiKey);
      const me = await rettiwt.user.details();

      if (!me) {
        return {
          status: 'unhealthy',
          message: 'Twitter API returned no user details',
        };
      }

      return {
        status: 'healthy',
        message: `Twitter API accessible for @${me.userName}`,
      };
    } catch (error) {
      this.logger.warn(`Twitter health check failed: ${(error as Error).message}`);

      return {
        status: 'unhealthy',
        message: this.toConnectorError(error).message,
      };
    }
  }

  async fetchContent(connection: PlatformConnectionData, since: Date | null): Promise<FetchResult> {
    const apiKey = this.extractApiKey(connection);
    const cursor = this.extractCursor(connection);

    try {
      const rettiwt = this.createClient(apiKey);

      const [feed, followingUsernames] = await Promise.all([
        rettiwt.user.followed(cursor),
        this.fetchFollowingUsernames(rettiwt),
      ]);

      const serialized = feed.list.map((tweet) => this.serializeTweet(tweet));
      const items = this.parseResponse(serialized);

      const filteredItems = items.filter((item) => {
        if (since && item.published_at < since) return false;
        if (!item.author_name) return false;
        return followingUsernames.has(item.author_name.toLowerCase());
      });

      this.logger.log(
        `Fetched ${items.length} tweets, kept ${filteredItems.length} from ${followingUsernames.size} followed accounts`,
      );

      return {
        items: filteredItems,
        has_more: Boolean(feed.next),
        next_cursor: feed.next || undefined,
        metadata: {
          api_calls_made: 2,
          following_count: followingUsernames.size,
          pre_filter_count: items.length,
        },
      };
    } catch (error) {
      throw this.toConnectorError(error);
    }
  }

  parseResponse(rawData: unknown): ContentItemInput[] {
    if (!Array.isArray(rawData)) return [];

    return rawData
      .flatMap((rawTweet) => {
        if (!this.isTweet(rawTweet)) {
          return [];
        }

        const userName = rawTweet.tweetBy.userName;
        const urlList = rawTweet.urls ?? rawTweet.entities?.urls ?? [];

        return [
          {
            external_id: rawTweet.id,
            content_type: 'tweet',
            title: null,
            body: rawTweet.fullText,
            media_urls: rawTweet.media?.map((media) => media.url) ?? [],
            metadata: {
              likeCount: rawTweet.likeCount,
              retweetCount: rawTweet.retweetCount,
              replyCount: rawTweet.replyCount,
              quotedTweet: rawTweet.quoted,
              urls: urlList,
            },
            author_name: userName,
            author_url: `https://x.com/${userName}`,
            original_url: `https://x.com/${userName}/status/${rawTweet.id}`,
            published_at: new Date(rawTweet.createdAt),
          },
        ];
      });
  }

  private createClient(apiKey: string): Rettiwt {
    return new Rettiwt({ apiKey, logging: false });
  }

  private async fetchFollowingUsernames(rettiwt: Rettiwt): Promise<Set<string>> {
    const MAX_PAGES = 50; // Safety limit: 50 pages × 100 users = 5000 max
    const usernames = new Set<string>();
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      const batch = await rettiwt.user.following(undefined, 100, cursor);

      // rettiwt-api bug: cursor keeps advancing even when no more users are returned.
      // Stop immediately when a page returns zero results to avoid an infinite loop.
      if (batch.list.length === 0) {
        break;
      }

      for (const user of batch.list) {
        usernames.add(user.userName.toLowerCase());
      }
      cursor = batch.next || undefined;
    } while (cursor && page < MAX_PAGES);

    return usernames;
  }

  private serializeTweet(tweet: ITweet): unknown {
    if ('toJSON' in tweet && typeof (tweet as { toJSON?: unknown }).toJSON === 'function') {
      return (tweet as { toJSON: () => unknown }).toJSON();
    }
    return tweet;
  }

  private extractApiKey(connection: PlatformConnectionData): string {
    const authData = connection.auth_data;

    if (!authData) {
      throw new ConnectorError('twitter', 'AUTH_EXPIRED', 'No Twitter credentials configured', false);
    }

    const apiKey = authData.api_key;
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      return apiKey;
    }

    const authToken = authData.auth_token;
    const ct0 = authData.ct0;

    if (typeof authToken === 'string' && authToken.length > 0 && typeof ct0 === 'string' && ct0.length > 0) {
      return buildApiKeyFromCookies(authToken, ct0);
    }

    throw new ConnectorError(
      'twitter',
      'AUTH_EXPIRED',
      'Twitter credentials must include api_key or auth_token + ct0',
      false,
    );
  }

  private extractCursor(connection: PlatformConnectionData): string | undefined {
    const cursor = connection.auth_data?.next_cursor;
    return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
  }

  private toConnectorError(error: unknown): ConnectorError {
    if (error instanceof ConnectorError) {
      return error;
    }

    const status = this.extractStatus(error);
    const message = this.extractMessage(error);

    if (status === 401 || status === 403) {
      return new ConnectorError('twitter', 'AUTH_EXPIRED', message, false);
    }

    if (status === 429 || message.includes('226')) {
      return new ConnectorError('twitter', 'RATE_LIMITED', message, true);
    }

    if (this.isNetworkError(error)) {
      return new ConnectorError('twitter', 'NETWORK_ERROR', message, true);
    }

    return new ConnectorError('twitter', 'PLATFORM_ERROR', message, false);
  }

  private extractStatus(error: unknown): number | undefined {
    if (!(error instanceof Error) || !('response' in error)) return undefined;

    const response = error.response;
    if (!response || typeof response !== 'object' || !('status' in response)) return undefined;

    const status = response.status;
    return typeof status === 'number' ? status : undefined;
  }

  private extractMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Twitter API request failed';
  }

  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const networkCodes = new Set(['ECONNABORTED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT']);
    const code = 'code' in error ? error.code : undefined;

    return typeof code === 'string' ? networkCodes.has(code) : false;
  }

  private isTweet(value: unknown): value is ITweet & { urls?: string[] } {
    if (!value || typeof value !== 'object') return false;

    const tweet = value as Partial<ITweet> & { urls?: string[] };

    return (
      typeof tweet.id === 'string' &&
      typeof tweet.fullText === 'string' &&
      typeof tweet.createdAt === 'string' &&
      typeof tweet.tweetBy?.userName === 'string'
    );
  }
}
