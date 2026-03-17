import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';

@Processor('retention')
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Starting content retention cleanup job...');

    // Using raw SQL to delete content_items older than their user's contentRetentionDays.
    // This is a system-level job, no RLS context needed.
    try {
      const result = await this.db.execute(sql`
        DELETE FROM content_items
        USING users
        WHERE content_items.user_id = users.id 
          AND content_items.published_at < NOW() - (users.content_retention_days * INTERVAL '1 day')
      `);

      this.logger.log(`Retention cleanup completed. Deleted ${result.rowCount} old items.`);
    } catch (error) {
      this.logger.error('Failed to run retention cleanup', error);
      throw error;
    }
  }
}
