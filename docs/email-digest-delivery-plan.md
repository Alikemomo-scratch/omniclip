# Email Digest Delivery — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send digest emails to users via Resend after digest generation completes.

**Architecture:** Add an `EmailModule` with BullMQ processor that consumes jobs dispatched by the existing digest pipeline. React Email renders the template, Resend delivers it.

**Tech Stack:** Resend SDK, React Email, BullMQ, Drizzle ORM, NestJS

---

## File Structure

```
packages/backend/src/email/
├── email.module.ts              # NestJS module (queue registration, imports)
├── email.service.ts             # Resend client wrapper
├── email.processor.ts           # BullMQ processor for email-delivery queue
├── email.constants.ts           # Queue name, config keys
├── templates/
│   └── digest-email.tsx         # React Email template component
└── __tests__/
    ├── email.service.spec.ts
    └── email.processor.spec.ts
```

**Modified files:**
- `packages/backend/src/common/database/schema/index.ts` — add `emailDeliveryLogs` table + `emailDigestEnabled` field
- `packages/backend/src/digest/digest.service.ts` — dispatch email job after completion
- `packages/backend/src/app.module.ts` — import EmailModule
- `packages/backend/package.json` — add resend + react-email deps
- `packages/backend/.env.example` — add RESEND_API_KEY, RESEND_FROM_EMAIL

---

## Task 1: Install dependencies and configure environment

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/.env.example` (or create if missing)

- [ ] **Step 1: Install packages**

```bash
cd packages/backend
pnpm add resend @react-email/components
pnpm add -D @types/react
```

- [ ] **Step 2: Add env vars to .env.example**

```env
# Email (Resend)
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=digest@yourdomain.com
```

- [ ] **Step 3: Add config validation in ConfigModule**

Register `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the NestJS config validation schema (follow existing pattern).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add resend and react-email dependencies"
```

---

## Task 2: Database schema — add email delivery log table + user setting

**Files:**
- Modify: `packages/backend/src/common/database/schema/index.ts`

- [ ] **Step 1: Add `emailDigestEnabled` column to users table**

```typescript
emailDigestEnabled: boolean('email_digest_enabled').default(true).notNull(),
```

- [ ] **Step 2: Add `emailDeliveryLogs` table**

```typescript
export const emailDeliveryLogs = pgTable('email_delivery_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  digestId: uuid('digest_id').notNull().references(() => digests.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  resendId: varchar('resend_id', { length: 100 }),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 3: Generate and run migration**

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add email_delivery_logs table and email_digest_enabled user field"
```

---

## Task 3: EmailService — Resend client wrapper

**Files:**
- Create: `packages/backend/src/email/email.constants.ts`
- Create: `packages/backend/src/email/email.service.ts`
- Create: `packages/backend/src/email/__tests__/email.service.spec.ts`

- [ ] **Step 1: Create constants file**

```typescript
// email.constants.ts
export const EMAIL_QUEUE_NAME = 'email-delivery';
export const EMAIL_CONFIG = {
  RESEND_API_KEY: 'RESEND_API_KEY',
  RESEND_FROM_EMAIL: 'RESEND_FROM_EMAIL',
} as const;
```

- [ ] **Step 2: Write failing test for EmailService**

```typescript
// email.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn((key: string) => {
              if (key === 'RESEND_API_KEY') return 're_test_key';
              if (key === 'RESEND_FROM_EMAIL') return 'test@example.com';
            }),
          },
        },
      ],
    }).compile();
    service = module.get(EmailService);
  });

  it('should send digest email', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    (service as any).resend = { emails: { send: mockSend } };

    const result = await service.sendDigestEmail('user@test.com', {
      subject: 'Daily Digest',
      html: '<h1>Hello</h1>',
    });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@test.com',
      from: 'test@example.com',
    }));
    expect(result.id).toBe('msg_123');
  });

  it('should throw on send failure', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });
    (service as any).resend = { emails: { send: mockSend } };

    await expect(service.sendDigestEmail('user@test.com', {
      subject: 'Test',
      html: '<p>test</p>',
    })).rejects.toThrow('Invalid API key');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run src/email/__tests__/email.service.spec.ts
```

- [ ] **Step 4: Implement EmailService**

```typescript
// email.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EMAIL_CONFIG } from './email.constants';

export interface SendEmailOptions {
  subject: string;
  html: string;
}

export interface SendResult {
  id: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private resend: Resend;
  private fromEmail: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.resend = new Resend(this.config.getOrThrow(EMAIL_CONFIG.RESEND_API_KEY));
    this.fromEmail = this.config.getOrThrow(EMAIL_CONFIG.RESEND_FROM_EMAIL);
  }

  async sendDigestEmail(to: string, options: SendEmailOptions): Promise<SendResult> {
    const { data, error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { id: data!.id };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run src/email/__tests__/email.service.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(email): add EmailService with Resend integration"
```

---

## Task 4: React Email template

**Files:**
- Create: `packages/backend/src/email/templates/digest-email.tsx`

- [ ] **Step 1: Create digest email template**

```tsx
// digest-email.tsx
import {
  Html, Head, Body, Container, Section, Heading,
  Text, Link, Hr, Preview,
} from '@react-email/components';
import * as React from 'react';

export interface DigestHeadlineProps {
  title: string;
  analysis: string;
  platform: string;
  original_url: string;
}

export interface DigestCategoryProps {
  topic: string;
  items: Array<{ one_liner: string; platform: string; original_url: string }>;
}

export interface DigestEmailProps {
  digestType: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  headlines: DigestHeadlineProps[];
  categories: DigestCategoryProps[];
  trendAnalysis: string;
  itemCount: number;
  appUrl?: string;
}

export function DigestEmail({
  digestType, periodStart, periodEnd,
  headlines, categories, trendAnalysis,
  itemCount, appUrl = 'https://app.omniclip.dev',
}: DigestEmailProps) {
  const title = digestType === 'daily' ? 'Daily Digest' : 'Weekly Digest';
  const dateRange = periodStart === periodEnd
    ? periodStart
    : `${periodStart} — ${periodEnd}`;

  return (
    <Html>
      <Head />
      <Preview>{`OmniClip ${title} — ${itemCount} items`}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
          <Heading as="h1" style={{ fontSize: 24 }}>
            OmniClip {title}
          </Heading>
          <Text style={{ color: '#6b7280' }}>
            {dateRange} · {itemCount} items
          </Text>

          {/* Headlines */}
          {headlines.length > 0 && (
            <Section>
              <Heading as="h2" style={{ fontSize: 18 }}>Headlines</Heading>
              {headlines.map((h, i) => (
                <Section key={i} style={{ marginBottom: 12 }}>
                  <Link href={h.original_url} style={{ fontWeight: 600, fontSize: 15 }}>
                    {h.title}
                  </Link>
                  <Text style={{ margin: '4px 0', fontSize: 14, color: '#374151' }}>
                    {h.analysis}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>{h.platform}</Text>
                </Section>
              ))}
            </Section>
          )}

          <Hr />

          {/* Categories */}
          {categories.map((cat, i) => (
            <Section key={i}>
              <Heading as="h3" style={{ fontSize: 16 }}>{cat.topic}</Heading>
              {cat.items.map((item, j) => (
                <Text key={j} style={{ fontSize: 14, margin: '4px 0' }}>
                  • <Link href={item.original_url}>{item.one_liner}</Link>
                  <span style={{ color: '#9ca3af' }}> ({item.platform})</span>
                </Text>
              ))}
            </Section>
          ))}

          {/* Trend Analysis */}
          {trendAnalysis && (
            <Section>
              <Hr />
              <Heading as="h3" style={{ fontSize: 16 }}>Trend Analysis</Heading>
              <Text style={{ fontSize: 14, color: '#374151' }}>{trendAnalysis}</Text>
            </Section>
          )}

          <Hr />
          <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' as const }}>
            <Link href={appUrl}>View in app</Link> · <Link href={`${appUrl}/settings`}>Manage notifications</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(email): add React Email digest template"
```

---

## Task 5: EmailProcessor — BullMQ consumer

**Files:**
- Create: `packages/backend/src/email/email.processor.ts`
- Create: `packages/backend/src/email/__tests__/email.processor.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// email.processor.spec.ts
import { Test } from '@nestjs/testing';
import { EmailProcessor } from '../email.processor';
import { EmailService } from '../email.service';
import { getQueueToken } from '@nestjs/bullmq';
import { EMAIL_QUEUE_NAME } from '../email.constants';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let emailService: { sendDigestEmail: ReturnType<typeof vi.fn> };
  let mockDb: any;

  beforeEach(async () => {
    emailService = { sendDigestEmail: vi.fn().mockResolvedValue({ id: 'msg_123' }) };
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailService },
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
      ],
    }).compile();

    processor = module.get(EmailProcessor);
  });

  it('should send email when user has email_digest_enabled', async () => {
    mockDb.where.mockResolvedValueOnce([{
      email: 'user@test.com',
      emailDigestEnabled: true,
    }]);
    mockDb.where.mockResolvedValueOnce([{
      id: 'digest-1',
      digestType: 'daily',
      periodStart: new Date('2026-04-29'),
      periodEnd: new Date('2026-04-29'),
      topicGroups: { headlines: [], categories: [] },
      trendAnalysis: 'Some trend',
      itemCount: 5,
    }]);

    await processor.process({ data: { digestId: 'digest-1', userId: 'user-1' } } as any);

    expect(emailService.sendDigestEmail).toHaveBeenCalledWith(
      'user@test.com',
      expect.objectContaining({ subject: expect.stringContaining('Daily Digest') }),
    );
  });

  it('should skip when email_digest_enabled is false', async () => {
    mockDb.where.mockResolvedValueOnce([{
      email: 'user@test.com',
      emailDigestEnabled: false,
    }]);

    await processor.process({ data: { digestId: 'digest-1', userId: 'user-1' } } as any);

    expect(emailService.sendDigestEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/email/__tests__/email.processor.spec.ts
```

- [ ] **Step 3: Implement EmailProcessor**

```typescript
// email.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { render } from '@react-email/components';
import { eq } from 'drizzle-orm';
import { EmailService } from './email.service';
import { EMAIL_QUEUE_NAME } from './email.constants';
import { users, digests, emailDeliveryLogs } from '../common/database/schema';
import { DigestEmail } from './templates/digest-email';

export interface EmailDeliveryJobData {
  digestId: string;
  userId: string;
}

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailService: EmailService,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
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
    const [digest] = await this.db
      .select()
      .from(digests)
      .where(eq(digests.id, digestId));

    if (!digest || digest.status !== 'completed') {
      this.logger.warn(`Digest ${digestId} not found or not completed`);
      return;
    }

    // 3. Render template
    const topicGroups = digest.topicGroups as any;
    const html = await render(
      DigestEmail({
        digestType: digest.digestType,
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/email/__tests__/email.processor.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(email): add EmailProcessor BullMQ consumer"
```

---

## Task 6: EmailModule + wire into app

**Files:**
- Create: `packages/backend/src/email/email.module.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: Create EmailModule**

```typescript
// email.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { EmailService } from './email.service';
import { EmailProcessor } from './email.processor';
import { EMAIL_QUEUE_NAME } from './email.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EMAIL_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    BullBoardModule.forFeature({
      name: EMAIL_QUEUE_NAME,
      adapter: BullMQAdapter,
    }),
  ],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService, BullModule],
})
export class EmailModule {}
```

- [ ] **Step 2: Import EmailModule in AppModule**

Add `EmailModule` to the imports array in `app.module.ts`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(email): register EmailModule in application"
```

---

## Task 7: Integration — dispatch email job after digest completion

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts`
- Modify: `packages/backend/src/digest/digest.module.ts`

- [ ] **Step 1: Inject email queue into DigestService**

In `digest.module.ts`, import `EmailModule` (or import BullModule queue directly).

In `digest.service.ts`, inject the email queue:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE_NAME } from '../email/email.constants';

// In constructor:
@InjectQueue(EMAIL_QUEUE_NAME) private readonly emailQueue: Queue,
```

- [ ] **Step 2: Dispatch email job in completeDigest**

After setting `status: 'completed'` in the `completeDigest` method:

```typescript
// After successful digest completion
await this.emailQueue.add('send-digest-email', {
  digestId,
  userId,
}, { delay: 5_000 }); // 5s delay to ensure DB transaction commits
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(email): dispatch email delivery job on digest completion"
```

---

## Task 8: Build verification + type check

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 2: Run build**

```bash
pnpm build
```

- [ ] **Step 3: Fix any errors and commit**

```bash
git add -A
git commit -m "fix: resolve type/build errors for email feature"
```
