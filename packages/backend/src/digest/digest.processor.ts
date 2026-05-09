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

  async process(job: Job<DigestJobData & { digestId?: string }>): Promise<void> {
    const { userId, digestType, language } = job.data;

    this.logger.log(
      `Processing ${digestType} digest for user ${userId} (attempt ${job.attemptsMade + 1})`,
    );

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (digestType === 'weekly') {
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);
    }

    let digestId = job.data.digestId;

    if (!digestId) {
      const existing = await this.digestService.findExistingDigestForDate(
        userId,
        digestType,
        periodEnd,
      );

      if (existing && existing.status === 'completed') {
        this.logger.log(
          `Skipping ${digestType} digest for user ${userId}: already completed today (${existing.id})`,
        );
        return;
      }

      if (existing && (existing.status === 'pending' || existing.status === 'generating')) {
        this.logger.log(
          `Reusing in-progress digest ${existing.id} for user ${userId}`,
        );
        digestId = existing.id;
      } else {
        digestId = await this.digestService.createPendingDigest(
          userId,
          digestType,
          periodStart,
          periodEnd,
          language,
        );
      }

      await job.updateData({ ...job.data, digestId });
    }

    try {
      await this.digestService.generateDigest(
        userId,
        digestType,
        periodStart,
        periodEnd,
        language,
        undefined,
        digestId,
      );

      this.logger.log(`Completed ${digestType} digest for user ${userId}`);
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      if (isFinalAttempt) {
        this.logger.error(
          `Digest generation exhausted all ${maxAttempts} attempts for user ${userId}: ${error}`,
        );
        await this.digestService.markDigestFailed(userId, digestId, error);
      } else {
        this.logger.warn(
          `Digest attempt ${job.attemptsMade + 1}/${maxAttempts} failed for user ${userId}, will retry: ${error}`,
        );
      }

      throw error;
    }
  }
}
