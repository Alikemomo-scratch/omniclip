import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE_NAME } from './sync.constants';

export interface SyncJobData {
  connectionId: string;
  userId: string;
  platform: string;
}

@Processor(SYNC_QUEUE_NAME)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  async process(job: Job<SyncJobData>): Promise<void> {
    this.logger.log(
      `Processing sync job ${job.id} for connection ${job.data.connectionId} (${job.data.platform})`,
    );

    // Skeleton — actual implementation in Phase 3 (T025)
    // 1. Fetch connection from DB
    // 2. Get connector from registry
    // 3. Call fetchContent(since: last_sync_at)
    // 4. Upsert content items
    // 5. Update last_sync_at
    // 6. Create sync_job audit record

    this.logger.log(`Sync job ${job.id} completed (skeleton)`);
  }
}
