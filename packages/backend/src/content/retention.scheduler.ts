import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(@InjectQueue('retention') private readonly retentionQueue: Queue) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing retention cleanup schedule...');

    const jobId = 'daily-retention-cleanup';
    const every = 24 * 60 * 60 * 1000; // 24 hours

    await this.retentionQueue.add(
      jobId,
      {},
      {
        repeat: { every },
        jobId,
      },
    );

    this.logger.log('Daily retention cleanup scheduled');
  }
}
