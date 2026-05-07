import { describe, expect, it, vi } from 'vitest';

import { DigestScheduler } from './digest.scheduler';

describe('DigestScheduler', () => {
  it('removes repeatable digest jobs for deleted users before scheduling current users', async () => {
    const currentUser = {
      id: 'user-current',
      digestFrequency: 'daily',
      digestTime: '08:00:00',
      timezone: 'Asia/Shanghai',
      preferredLanguage: 'zh',
    };
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockResolvedValue([currentUser]),
    };
    const queue = {
      getRepeatableJobs: vi.fn().mockResolvedValue([
        { key: 'current-key', name: 'digest-user-current' },
        { key: 'stale-key', name: 'digest-deleted-user' },
      ]),
      removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new DigestScheduler(queue as any, db as any);

    await scheduler.scheduleAllUserDigests();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('stale-key');
    expect(queue.removeRepeatableByKey.mock.calls[0]).toEqual(['stale-key']);
  });
});
