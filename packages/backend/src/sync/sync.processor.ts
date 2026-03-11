import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { SYNC_QUEUE_NAME } from './sync.constants';
import { ConnectionsService } from '../connections/connections.service';
import { ContentService } from '../content/content.service';
import type { ContentItemInput } from '../content/content.service';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { ConnectorError } from '../connectors/interfaces/connector-error';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { platformConnections, syncJobs } from '../common/database/schema';
import type { PlatformConnectionData } from '@omniclip/shared';

export interface SyncJobData {
  connectionId: string;
  userId: string;
  platform: string;
}

@Processor(SYNC_QUEUE_NAME)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly contentService: ContentService,
    private readonly connectorRegistry: ConnectorRegistry,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { connectionId, userId, platform } = job.data;
    const startedAt = new Date();

    this.logger.log(`Processing sync job ${job.id} for connection ${connectionId} (${platform})`);

    // 1. Fetch connection with auth data
    const connection = await this.connectionsService.findByIdWithAuth(userId, connectionId);

    // 2. Get connector from registry
    const connector = this.connectorRegistry.get(
      platform as 'github' | 'youtube' | 'twitter' | 'xiaohongshu',
    );

    // 3. Build PlatformConnectionData for the connector
    const connData: PlatformConnectionData = {
      id: connection.id,
      user_id: connection.userId,
      platform: connection.platform as PlatformConnectionData['platform'],
      connection_type: connection.connectionType as PlatformConnectionData['connection_type'],
      status: connection.status as PlatformConnectionData['status'],
      auth_data: connection.authData as Record<string, unknown> | null,
      sync_interval_minutes: connection.syncIntervalMinutes,
      last_sync_at: connection.lastSyncAt,
    };

    try {
      // 4. Fetch content from platform
      const fetchResult = await connector.fetchContent(connData, connection.lastSyncAt);

      // 5. Map connector items to ContentService input format
      const contentInputs: ContentItemInput[] = fetchResult.items.map((item) => ({
        connectionId,
        platform,
        externalId: item.external_id,
        contentType: item.content_type,
        title: item.title,
        body: item.body,
        originalUrl: item.original_url,
        publishedAt: item.published_at,
        authorName: item.author_name,
        authorUrl: item.author_url,
        mediaUrls: item.media_urls,
        metadata: item.metadata,
      }));

      // 6. Upsert content items
      const upsertedCount = await this.contentService.upsertMany(userId, contentInputs);

      // 7. Update last_sync_at and create sync_job record
      await this.db.transaction(async (tx) => {
        // Update connection's last_sync_at
        await tx
          .update(platformConnections)
          .set({
            lastSyncAt: new Date(),
            lastError: null,
            errorCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(platformConnections.id, connectionId));

        // Create sync_job audit record
        await tx
          .insert(syncJobs)
          .values({
            userId,
            connectionId,
            platform,
            status: 'completed',
            itemsCollected: upsertedCount,
            startedAt,
            completedAt: new Date(),
          })
          .returning({ id: syncJobs.id });
      });

      this.logger.log(`Sync job ${job.id} completed: ${upsertedCount} items upserted`);
    } catch (error) {
      await this.handleSyncError(error, userId, connectionId, platform, startedAt);
    }
  }

  /**
   * Handle sync errors according to the connector error contract.
   */
  private async handleSyncError(
    error: unknown,
    userId: string,
    connectionId: string,
    platform: string,
    startedAt: Date,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof ConnectorError) {
      if (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REVOKED') {
        // Mark connection as error — user action needed, don't retry
        this.logger.warn(`Connection ${connectionId} auth error: ${error.code} — ${errorMessage}`);
        await this.recordFailure(userId, connectionId, platform, errorMessage, startedAt, 'error');
        return; // Don't re-throw — BullMQ won't retry
      }

      if (error.retryable) {
        // RATE_LIMITED, NETWORK_ERROR etc. — record failure and re-throw for BullMQ retry
        this.logger.warn(
          `Connection ${connectionId} retryable error: ${error.code} — ${errorMessage}`,
        );
        await this.recordFailure(userId, connectionId, platform, errorMessage, startedAt);
        throw error;
      }

      // Non-retryable connector errors (PARSE_ERROR, PLATFORM_ERROR, etc.)
      this.logger.error(
        `Connection ${connectionId} non-retryable error: ${error.code} — ${errorMessage}`,
      );
      await this.recordFailure(userId, connectionId, platform, errorMessage, startedAt);
      return;
    }

    // Generic errors — record and re-throw
    this.logger.error(`Connection ${connectionId} unexpected error: ${errorMessage}`);
    await this.recordFailure(userId, connectionId, platform, errorMessage, startedAt);
    throw error;
  }

  /**
   * Record a failed sync attempt in the database.
   */
  private async recordFailure(
    userId: string,
    connectionId: string,
    platform: string,
    errorMessage: string,
    startedAt: Date,
    connectionStatus?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Update connection error info
      const updateData: Record<string, unknown> = {
        lastError: errorMessage,
        updatedAt: new Date(),
      };
      if (connectionStatus) {
        updateData.status = connectionStatus;
      }
      await tx
        .update(platformConnections)
        .set(updateData)
        .where(eq(platformConnections.id, connectionId));

      // Create failed sync_job record
      await tx
        .insert(syncJobs)
        .values({
          userId,
          connectionId,
          platform,
          status: 'failed',
          errorMessage,
          startedAt,
          completedAt: new Date(),
        })
        .returning({ id: syncJobs.id });
    });
  }
}
