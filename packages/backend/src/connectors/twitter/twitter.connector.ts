import { Injectable, Inject, Logger } from '@nestjs/common';
import type {
  PlatformConnector,
  PlatformConnectionData,
  HealthCheckResult,
  FetchResult,
  ContentItemInput,
} from '@omniclip/shared';
import { DRIZZLE } from '../../common/database/database.constants';
import type { DrizzleDB } from '../../common/database/rls.middleware';

/** Heartbeat freshness threshold (10 minutes). */
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;

/**
 * Twitter connector — extension-type.
 * Content is pushed FROM the browser extension, not fetched by the server.
 * healthCheck validates that the extension is actively sending heartbeats.
 * fetchContent is a no-op.
 * parseResponse normalizes incoming sync payloads.
 */
@Injectable()
export class TwitterConnector implements PlatformConnector {
  private readonly logger = new Logger(TwitterConnector.name);

  readonly platform = 'twitter' as const;
  readonly type = 'extension' as const;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Check whether the extension recently sent a heartbeat.
   */
  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    const lastSync = connection.last_sync_at;

    if (!lastSync) {
      return {
        status: 'unhealthy',
        message: 'No heartbeat received from extension yet',
      };
    }

    const elapsed = Date.now() - new Date(lastSync).getTime();

    if (elapsed > HEARTBEAT_STALE_MS) {
      return {
        status: 'unhealthy',
        message: `Last heartbeat was ${Math.round(elapsed / 60_000)} minutes ago`,
      };
    }

    return {
      status: 'healthy',
      message: 'Extension is actively sending heartbeats',
    };
  }

  /**
   * No-op — the extension pushes content, the server does not fetch.
   */
  async fetchContent(
    _connection: PlatformConnectionData,
    _since: Date | null,
  ): Promise<FetchResult> {
    return {
      items: [],
      has_more: false,
      metadata: { api_calls_made: 0 },
    };
  }

  /**
   * Normalize incoming extension sync payloads into ContentItemInput[].
   */
  parseResponse(rawData: unknown): ContentItemInput[] {
    if (!rawData || !Array.isArray(rawData)) return [];

    const items: ContentItemInput[] = [];

    for (const raw of rawData) {
      if (!raw || typeof raw !== 'object') continue;

      const item = raw as Record<string, unknown>;
      const externalId = item.external_id as string | undefined;
      const originalUrl = item.original_url as string | undefined;

      // Skip items missing required fields
      if (!externalId || !originalUrl) continue;

      items.push({
        external_id: externalId,
        content_type: (item.content_type as string) || 'tweet',
        title: (item.title as string) || null,
        body: (item.body as string) || null,
        media_urls: Array.isArray(item.media_urls) ? (item.media_urls as string[]) : [],
        metadata: (item.metadata as Record<string, unknown>) || {},
        author_name: (item.author_name as string) || null,
        author_url: (item.author_url as string) || null,
        original_url: originalUrl,
        published_at: item.published_at ? new Date(item.published_at as string) : new Date(),
      });
    }

    return items;
  }
}
