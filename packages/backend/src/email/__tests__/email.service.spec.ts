import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
              throw new Error(`Unknown key: ${key}`);
            }),
          },
        },
      ],
    }).compile();
    service = module.get(EmailService);
    service.onModuleInit();
  });

  it('should send digest email', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    (service as any).resend = { emails: { send: mockSend } };

    const result = await service.sendDigestEmail('user@test.com', {
      subject: 'Daily Digest',
      html: '<h1>Hello</h1>',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        from: 'test@example.com',
      }),
    );
    expect(result.id).toBe('msg_123');
  });

  it('should throw on send failure', async () => {
    const mockSend = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });
    (service as any).resend = { emails: { send: mockSend } };

    await expect(
      service.sendDigestEmail('user@test.com', {
        subject: 'Test',
        html: '<p>test</p>',
      }),
    ).rejects.toThrow('Invalid API key');
  });
});
