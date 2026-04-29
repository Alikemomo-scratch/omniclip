import { Test } from '@nestjs/testing';
import { EmailProcessor } from '../email.processor';
import { EmailService } from '../email.service';
import { DRIZZLE } from '../../common/database';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let emailService: { sendDigestEmail: ReturnType<typeof vi.fn> };

  // Helper to create a chainable mock DB
  function createMockDb(results: any[][]) {
    let callCount = 0;
    const mockDb: any = {
      select: vi.fn().mockImplementation(() => {
        const currentResults = results[callCount++] ?? [];
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(currentResults),
          }),
        };
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };
    return mockDb;
  }

  beforeEach(async () => {
    emailService = { sendDigestEmail: vi.fn().mockResolvedValue({ id: 'msg_123' }) };
  });

  it('should send email when user has email_digest_enabled', async () => {
    const mockDb = createMockDb([
      [{ email: 'user@test.com', emailDigestEnabled: true }],
      [
        {
          id: 'digest-1',
          digestType: 'daily',
          status: 'completed',
          periodStart: new Date('2026-04-29'),
          periodEnd: new Date('2026-04-29'),
          topicGroups: { headlines: [], categories: [] },
          trendAnalysis: 'Some trend',
          itemCount: 5,
        },
      ],
    ]);

    const module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailService },
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();
    processor = module.get(EmailProcessor);

    await processor.process({ data: { digestId: 'digest-1', userId: 'user-1' } } as any);

    expect(emailService.sendDigestEmail).toHaveBeenCalledWith(
      'user@test.com',
      expect.objectContaining({ subject: expect.stringContaining('Daily Digest') }),
    );
  });

  it('should skip when email_digest_enabled is false', async () => {
    const mockDb = createMockDb([[{ email: 'user@test.com', emailDigestEnabled: false }]]);

    const module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailService },
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();
    processor = module.get(EmailProcessor);

    await processor.process({ data: { digestId: 'digest-1', userId: 'user-1' } } as any);

    expect(emailService.sendDigestEmail).not.toHaveBeenCalled();
  });

  it('should log failure and re-throw on send error', async () => {
    const mockDb = createMockDb([
      [{ email: 'user@test.com', emailDigestEnabled: true }],
      [
        {
          id: 'digest-1',
          digestType: 'daily',
          status: 'completed',
          periodStart: new Date('2026-04-29'),
          periodEnd: new Date('2026-04-29'),
          topicGroups: { headlines: [], categories: [] },
          trendAnalysis: '',
          itemCount: 0,
        },
      ],
    ]);

    emailService.sendDigestEmail.mockRejectedValue(new Error('API error'));

    const module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailService },
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();
    processor = module.get(EmailProcessor);

    await expect(
      processor.process({ data: { digestId: 'digest-1', userId: 'user-1' } } as any),
    ).rejects.toThrow('API error');

    expect(mockDb.insert).toHaveBeenCalled();
  });
});
