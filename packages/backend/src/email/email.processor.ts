import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { render } from '@react-email/components';
import { eq } from 'drizzle-orm';
import { EmailService } from './email.service';
import { EMAIL_QUEUE_NAME } from './email.constants';
import { users, digests, emailDeliveryLogs } from '../common/database/schema';
import { DigestEmail } from './templates/digest-email';
import { DRIZZLE } from '../common/database';
import type { DrizzleDB } from '../common/database';

export interface EmailDeliveryJobData {
  digestId: string;
  userId: string;
}

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailService: EmailService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super();
  }

  async process(job: Job<EmailDeliveryJobData>): Promise<void> {
    const { digestId, userId } = job.data;

    // 1. Load user
    const [user] = await this.db
      .select({ email: users.email, emailDigestEnabled: users.emailDigestEnabled })
      .from(users)
      .where(eq(users.id, userId));

    if (!user || !user.emailDigestEnabled) {
      this.logger.log(`Skipping email for user ${userId} (disabled or not found)`);
      return;
    }

    // 2. Load digest
    const [digest] = await this.db.select().from(digests).where(eq(digests.id, digestId));

    if (!digest || digest.status !== 'completed') {
      this.logger.warn(`Digest ${digestId} not found or not completed`);
      return;
    }

    // 3. Render template
    const topicGroups = digest.topicGroups as any;
    const html = await render(
      DigestEmail({
        digestType: digest.digestType as 'daily' | 'weekly',
        periodStart: digest.periodStart.toISOString().split('T')[0],
        periodEnd: digest.periodEnd.toISOString().split('T')[0],
        headlines: topicGroups?.headlines ?? [],
        categories: topicGroups?.categories ?? [],
        trendAnalysis: digest.trendAnalysis ?? '',
        itemCount: digest.itemCount ?? 0,
      }),
    );

    // 4. Send email
    const typeLabel = digest.digestType === 'daily' ? 'Daily' : 'Weekly';
    const dateStr = digest.periodStart.toISOString().split('T')[0];
    const subject = `OmniClip ${typeLabel} Digest — ${dateStr}`;

    try {
      const result = await this.emailService.sendDigestEmail(user.email, { subject, html });

      // 5. Log success
      await this.db.insert(emailDeliveryLogs).values({
        userId,
        digestId,
        status: 'sent',
        resendId: result.id,
        sentAt: new Date(),
      });

      this.logger.log(`Email sent to ${user.email} for digest ${digestId}`);
    } catch (error) {
      // Log failure
      await this.db.insert(emailDeliveryLogs).values({
        userId,
        digestId,
        status: 'failed',
        error: (error as Error).message,
      });
      throw error; // Re-throw for BullMQ retry
    }
  }
}
