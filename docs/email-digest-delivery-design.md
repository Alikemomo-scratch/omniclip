# Email Digest Delivery — Design Spec

**Date**: 2026-04-29  
**Status**: Draft  
**Branch**: `feature/email-digest-delivery`

## Overview

Add automated email delivery for generated digests. When a digest completes generation, an email containing the digest content is sent to the user's inbox via Resend.

## Goals

- Deliver digest to user email automatically after generation completes
- Beautiful, responsive email using React Email templates
- Reliable delivery with retry logic (leveraging existing BullMQ infrastructure)
- User opt-in/out control via settings

## Non-Goals (for this iteration)

- Other delivery channels (Slack, Telegram, Feishu) — future work
- Manual "send to email" button — future iteration
- Email verification flow — assume registered email is valid
- Unsubscribe via email link (one-click) — future iteration (use app settings for now)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Existing Digest Pipeline                                │
│                                                         │
│  DigestScheduler → DigestProcessor (LLM generation)     │
│                           │                             │
│                           ▼ status = 'completed'        │
│                    ┌──────────────┐                     │
│                    │ Add job to   │                     │
│                    │ email-delivery│                     │
│                    │ queue        │                     │
│                    └──────┬───────┘                     │
└───────────────────────────┼─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ New: Email Delivery Module                              │
│                                                         │
│  EmailProcessor (BullMQ)                                │
│    1. Load digest data + user settings                  │
│    2. Check email_digest_enabled                        │
│    3. Render DigestEmailTemplate (React Email)          │
│    4. Send via Resend SDK                               │
│    5. Log delivery result                               │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. EmailModule (`packages/backend/src/email/`)

NestJS module encapsulating all email functionality.

```
email/
├── email.module.ts          # Module definition
├── email.service.ts         # Resend client wrapper
├── email.processor.ts       # BullMQ processor for email-delivery queue
├── email.constants.ts       # Queue names, config keys
└── templates/
    └── digest-email.tsx     # React Email template
```

### 2. EmailService

Thin wrapper around Resend SDK:

```typescript
interface EmailService {
  sendDigestEmail(to: string, digest: DigestData): Promise<SendResult>;
}
```

- Initializes Resend client with API key from env (`RESEND_API_KEY`)
- Renders React Email template to HTML
- Sends via `resend.emails.send()`
- Returns send result (id, status)

### 3. EmailProcessor (BullMQ)

Consumes jobs from `email-delivery` queue:

```typescript
interface EmailDeliveryJob {
  digestId: string;
  userId: string;
}
```

Processing steps:
1. Load digest (with topic_groups, trend_analysis)
2. Load user (email, settings)
3. Guard: skip if `email_digest_enabled === false`
4. Render template with digest data
5. Call `EmailService.sendDigestEmail()`
6. Insert record into `email_delivery_logs`

Retry policy: 3 attempts, exponential backoff (30s, 2min, 10min).

### 4. DigestEmailTemplate (React Email)

React component rendering the digest into a responsive HTML email:

```
┌─────────────────────────────────┐
│ OmniClip Logo                   │
├─────────────────────────────────┤
│ Daily Digest — 2026-04-29       │
│ 15 items from 3 platforms       │
├─────────────────────────────────┤
│ 🔥 Headlines                    │
│  1. [Title] — summary...        │
│  2. [Title] — summary...        │
│  3. [Title] — summary...        │
├─────────────────────────────────┤
│ 📂 GitHub                       │
│  • item summary...              │
│  • item summary...              │
├─────────────────────────────────┤
│ 📂 YouTube                      │
│  • item summary...              │
├─────────────────────────────────┤
│ 💡 Trend Analysis               │
│  paragraph...                   │
├─────────────────────────────────┤
│ View full digest in app →       │
│ Manage notification settings    │
└─────────────────────────────────┘
```

### 5. Database Changes

**Extend `user_settings`** (or `users` table, depending on current schema):

```sql
ALTER TABLE user_settings ADD COLUMN email_digest_enabled BOOLEAN DEFAULT true;
```

**New table `email_delivery_logs`**:

```sql
CREATE TABLE email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  digest_id UUID NOT NULL REFERENCES digests(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, sent, failed, bounced
  resend_id VARCHAR(100),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. Integration Point

In `DigestProcessor.process()`, after setting digest status to `completed`:

```typescript
// After digest generation completes
await this.emailDeliveryQueue.add('send-digest-email', {
  digestId: digest.id,
  userId: digest.userId,
});
```

## Configuration

Environment variables:

```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=digest@omniclip.app  # Or noreply@yourdomain.com
```

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `resend` | Email sending API | ~50KB |
| `@react-email/components` | Email UI primitives | ~200KB |
| `react` (peer) | Required by React Email | already in monorepo |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Resend API down | BullMQ retries 3x with backoff |
| Invalid email (hard bounce) | Log error, do NOT disable (leave for future iteration) |
| User disabled notifications | Skip silently, mark job as completed |
| Digest not found | Mark job as failed, log error |
| Rate limit (Resend free: 100/day) | BullMQ backoff handles naturally |

## Testing Strategy

- **Unit**: EmailService with mocked Resend client
- **Unit**: EmailProcessor with mocked EmailService + DB
- **Integration**: Template rendering produces valid HTML
- **E2E** (manual): Trigger digest → verify email received

## Future Considerations

- Unsubscribe link (RFC 8058 List-Unsubscribe header)
- Email verification before enabling delivery
- Delivery to multiple channels (Slack, Telegram) — same queue pattern
- Email analytics (open rate via Resend webhooks)
- Custom email frequency separate from digest frequency
