import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';

import { DIGEST_QUEUE_NAME } from './digest.constants';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { users } from '../common/database/schema';

export interface DigestJobData {
  userId: string;
  digestType: string;
  language: string;
}

@Injectable()
export class DigestScheduler implements OnModuleInit {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(
    @InjectQueue(DIGEST_QUEUE_NAME) private readonly digestQueue: Queue,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing digest scheduling...');
    await this.scheduleAllUserDigests();
  }

  /**
   * Schedule digest jobs for all users based on their preferences.
   */
  async scheduleAllUserDigests(): Promise<void> {
    // Query all users (no RLS needed — scheduler is system-level)
    const allUsers = await this.db
      .select({
        id: users.id,
        digestFrequency: users.digestFrequency,
        digestTime: users.digestTime,
        timezone: users.timezone,
        preferredLanguage: users.preferredLanguage,
      })
      .from(users);

    for (const user of allUsers) {
      if (user.digestFrequency === 'manual') {
        // Skip users who only want manual digests
        continue;
      }

      await this.scheduleUserDigest(
        user.id,
        user.digestFrequency,
        user.digestTime,
        user.timezone,
        user.preferredLanguage,
      );
    }

    this.logger.log(`Scheduled digest jobs for ${allUsers.length} users`);
  }

  /**
   * Schedule (or update) a repeatable digest job for a specific user.
   */
  async scheduleUserDigest(
    userId: string,
    frequency: string,
    digestTime: string,
    timezone: string,
    language: string,
  ): Promise<void> {
    // Remove existing repeatable job for this user
    const jobId = `digest-${userId}`;

    // Remove old repeatable jobs
    const repeatableJobs = await this.digestQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === jobId) {
        await this.digestQueue.removeRepeatableByKey(job.key);
      }
    }

    // Parse digest time (e.g., "08:00") → hour and minute
    const [hour, minute] = digestTime.split(':').map(Number);

    // Build cron pattern based on frequency
    let pattern: string;
    if (frequency === 'weekly') {
      // Every Monday at the specified time
      pattern = `${minute} ${hour} * * 1`;
    } else {
      // Daily at the specified time
      pattern = `${minute} ${hour} * * *`;
    }

    const jobData: DigestJobData = {
      userId,
      digestType: frequency,
      language,
    };

    await this.digestQueue.add(jobId, jobData, {
      repeat: {
        pattern,
        tz: timezone,
      },
      jobId,
    });

    this.logger.log(
      `Scheduled ${frequency} digest for user ${userId} at ${digestTime} (${timezone})`,
    );
  }

  /**
   * Remove a user's scheduled digest job.
   */
  async removeUserDigest(userId: string): Promise<void> {
    const jobId = `digest-${userId}`;
    const repeatableJobs = await this.digestQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      if (job.id === jobId) {
        await this.digestQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed digest schedule for user ${userId}`);
      }
    }
  }
}
