import { describe, it, expect } from 'vitest';
import { SyncProcessor } from './sync.processor';
import type { Job } from 'bullmq';
import type { SyncJobData } from './sync.processor';

describe('SyncProcessor', () => {
  it('should process a sync job without error (skeleton)', async () => {
    const processor = new SyncProcessor();

    const mockJob = {
      id: 'job-1',
      data: {
        connectionId: 'conn-1',
        userId: 'user-1',
        platform: 'github',
      },
    } as Job<SyncJobData>;

    // Should not throw — skeleton just logs
    await expect(processor.process(mockJob)).resolves.toBeUndefined();
  });
});
