import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { SYNC_QUEUE_NAME } from './sync.constants';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { platformConnections, syncJobs } from '../common/database/schema';
import type { SyncJobData } from './sync.processor';

export interface SyncJobQueryDto {
  connection_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(SYNC_QUEUE_NAME) private readonly syncQueue: Queue<SyncJobData>,
  ) {}

  /**
   * On startup: query all active API connections and create repeatable BullMQ jobs.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing sync schedules for active API connections...');

    // Query active API connections directly (no RLS — system-level operation)
    const connections = await this.db.transaction(async (tx) => {
      return (tx as any)
        .select({
          id: platformConnections.id,
          userId: platformConnections.userId,
          platform: platformConnections.platform,
          syncIntervalMinutes: platformConnections.syncIntervalMinutes,
          connectionType: platformConnections.connectionType,
        })
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.status, 'active'),
            eq(platformConnections.connectionType, 'api'),
          ),
        );
    });

    for (const conn of connections) {
      await this.scheduleConnection(conn.id, conn.userId, conn.platform, conn.syncIntervalMinutes);
    }

    this.logger.log(`Initialized ${connections.length} sync schedules`);
  }

  /**
   * Add a repeatable BullMQ job for a connection.
   */
  async scheduleConnection(
    connectionId: string,
    userId: string,
    platform: string,
    syncIntervalMinutes: number,
  ): Promise<void> {
    const jobId = `sync:${connectionId}`;

    const TWITTER_MIN_INTERVAL_MINUTES = 30;
    const effectiveInterval =
      platform === 'twitter'
        ? Math.max(syncIntervalMinutes, TWITTER_MIN_INTERVAL_MINUTES)
        : syncIntervalMinutes;

    const jitterFactor = 0.8 + Math.random() * 0.4;
    const every = Math.round(effectiveInterval * 60 * 1000 * jitterFactor);

    await this.syncQueue.add(
      jobId,
      { connectionId, userId, platform },
      {
        repeat: { every },
        jobId,
      },
    );

    this.logger.log(
      `Scheduled sync for connection ${connectionId} (${platform}) every ${effectiveInterval}min (with jitter: ${Math.round(
        every / 1000 / 60,
      )}min)`,
    );
  }

  /**
   * Remove a repeatable job for a connection.
   */
  async removeConnection(connectionId: string): Promise<void> {
    const jobId = `sync:${connectionId}`;
    const repeatableJobs = await this.syncQueue.getRepeatableJobs();
    const matching = repeatableJobs.find((j) => j.id === jobId);

    if (matching) {
      await this.syncQueue.removeRepeatableByKey(matching.key);
      this.logger.log(`Removed sync schedule for connection ${connectionId}`);
    }
  }

  /**
   * Update a repeatable job (remove old, add new).
   */
  async updateConnection(
    connectionId: string,
    userId: string,
    platform: string,
    syncIntervalMinutes: number,
  ): Promise<void> {
    await this.removeConnection(connectionId);
    await this.scheduleConnection(connectionId, userId, platform, syncIntervalMinutes);
  }

  /**
   * Manually trigger a one-off sync job immediately.
   */
  async triggerManualSync(connectionId: string, userId: string, platform: string): Promise<void> {
    const jobId = `manual-sync:${connectionId}:${Date.now()}`;
    await this.syncQueue.add(
      jobId,
      { connectionId, userId, platform },
      { jobId }, // No repeat option
    );
    this.logger.log(`Manually triggered sync for connection ${connectionId}`);
  }

  /**
   * List recent sync jobs for a user (RLS-scoped).
   */
  async findRecentJobs(userId: string, query: SyncJobQueryDto): Promise<{ jobs: unknown[] }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    return withRlsContext(this.db, userId, async (tx) => {
      const conditions = [];

      if (query.connection_id) {
        conditions.push(eq(syncJobs.connectionId, query.connection_id));
      }
      if (query.status) {
        conditions.push(eq(syncJobs.status, query.status));
      }

      const jobs = await tx
        .select({
          id: syncJobs.id,
          connection_id: syncJobs.connectionId,
          platform: syncJobs.platform,
          status: syncJobs.status,
          items_collected: syncJobs.itemsCollected,
          error_message: syncJobs.errorMessage,
          started_at: syncJobs.startedAt,
          completed_at: syncJobs.completedAt,
        })
        .from(syncJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(sql`${syncJobs.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

      return { jobs };
    });
  }

  /**
   * Called by the sync processor on job failure.
   * Reschedules with exponential backoff: base × 2^n, capped at 1 hour.
   */
  async handleSyncFailure(
    connectionId: string,
    userId: string,
    platform: string,
    consecutiveFailures: number,
  ): Promise<void> {
    const baseInterval = platform === 'twitter' ? 30 : 60;
    const backoffMultiplier = Math.min(Math.pow(2, consecutiveFailures), 60 / baseInterval);
    const backoffMinutes = Math.min(baseInterval * backoffMultiplier, 60);

    this.logger.warn(
      `Connection ${connectionId} failed ${consecutiveFailures} times, backing off to ${backoffMinutes}min`,
    );

    await this.removeConnection(connectionId);
    await this.scheduleConnection(connectionId, userId, platform, backoffMinutes);
  }

  /**
   * Called by the sync processor on job success after previous failures.
   * Restores original sync interval.
   */
  async handleSyncRecovery(
    connectionId: string,
    userId: string,
    platform: string,
    originalIntervalMinutes: number,
  ): Promise<void> {
    this.logger.log(
      `Connection ${connectionId} recovered, restoring ${originalIntervalMinutes}min interval`,
    );

    await this.removeConnection(connectionId);
    await this.scheduleConnection(connectionId, userId, platform, originalIntervalMinutes);
  }
}
