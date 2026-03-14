import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { DIGEST_QUEUE_NAME } from './digest.constants';
import { DigestService } from './digest.service';
import type { DigestJobData } from './digest.scheduler';

@Processor(DIGEST_QUEUE_NAME)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(private readonly digestService: DigestService) {
    super();
  }

  async process(job: Job<DigestJobData>): Promise<void> {
    const { userId, digestType, language } = job.data;

    this.logger.log(`Processing ${digestType} digest for user ${userId}`);

    // Calculate period based on digest type
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (digestType === 'weekly') {
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      // daily
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);
    }

    await this.digestService.generateDigest(userId, digestType, periodStart, periodEnd, language);

    this.logger.log(`Completed ${digestType} digest for user ${userId}`);
  }
}
