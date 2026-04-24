import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncScheduler } from './sync.scheduler';

describe('SyncScheduler', () => {
  let scheduler: SyncScheduler;
  let mockDb: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let mockTx: {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    offset: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
  let mockQueue: {
    add: ReturnType<typeof vi.fn>;
    removeRepeatableByKey: ReturnType<typeof vi.fn>;
    getRepeatableJobs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Fix jitter to 1.0 so test assertions use exact values
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      execute: vi.fn(),
    };
    mockDb = {
      transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };
    mockQueue = {
      add: vi.fn().mockResolvedValue(undefined),
      removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
      getRepeatableJobs: vi.fn().mockResolvedValue([]),
    };

    scheduler = new SyncScheduler(mockDb as any, mockQueue as any);
  });

  describe('onApplicationBootstrap', () => {
    it('should schedule repeatable jobs for all active API connections', async () => {
      const connections = [
        {
          id: 'conn-1',
          userId: 'user-1',
          platform: 'github',
          syncIntervalMinutes: 60,
          connectionType: 'api',
        },
        {
          id: 'conn-2',
          userId: 'user-2',
          platform: 'github',
          syncIntervalMinutes: 30,
          connectionType: 'api',
        },
      ];
      // select().from().where() returns connections
      mockTx.where.mockResolvedValueOnce(connections);

      await scheduler.onApplicationBootstrap();

      // Should add a repeatable job for each connection
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync:conn-1',
        { connectionId: 'conn-1', userId: 'user-1', platform: 'github' },
        expect.objectContaining({
          repeat: { every: 60 * 60 * 1000 },
          jobId: 'sync:conn-1',
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync:conn-2',
        { connectionId: 'conn-2', userId: 'user-2', platform: 'github' },
        expect.objectContaining({
          repeat: { every: 30 * 60 * 1000 },
          jobId: 'sync:conn-2',
        }),
      );
    });

    it('should handle no active connections gracefully', async () => {
      mockTx.where.mockResolvedValueOnce([]);

      await scheduler.onApplicationBootstrap();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('scheduleConnection', () => {
    it('should add a repeatable job for a connection', async () => {
      await scheduler.scheduleConnection('conn-1', 'user-1', 'github', 60);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync:conn-1',
        { connectionId: 'conn-1', userId: 'user-1', platform: 'github' },
        expect.objectContaining({
          repeat: { every: 60 * 60 * 1000 },
          jobId: 'sync:conn-1',
        }),
      );
    });
  });

  describe('removeConnection', () => {
    it('should remove a repeatable job for a connection', async () => {
      mockQueue.getRepeatableJobs.mockResolvedValue([
        { key: 'sync:conn-1:::60000', id: 'sync:conn-1' },
        { key: 'sync:conn-2:::30000', id: 'sync:conn-2' },
      ]);

      await scheduler.removeConnection('conn-1');

      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('sync:conn-1:::60000');
    });

    it('should do nothing if no matching job found', async () => {
      mockQueue.getRepeatableJobs.mockResolvedValue([
        { key: 'sync:conn-2:::30000', id: 'sync:conn-2' },
      ]);

      await scheduler.removeConnection('conn-1');

      expect(mockQueue.removeRepeatableByKey).not.toHaveBeenCalled();
    });
  });

  describe('findRecentJobs', () => {
    it('should return recent sync jobs for a user', async () => {
      const jobs = [
        {
          id: 'sj-1',
          connection_id: 'conn-1',
          platform: 'github',
          status: 'completed',
          items_collected: 5,
          started_at: new Date(),
          completed_at: new Date(),
        },
      ];
      // findRecentJobs uses withRlsContext: select().from().where().orderBy().limit().offset()
      mockTx.where
        .mockReturnValueOnce(mockTx) // count query returns chainable (but we skip count for simplicity)
        .mockReturnValueOnce(mockTx); // data query chains to orderBy
      mockTx.offset.mockResolvedValueOnce(jobs);

      const result = await scheduler.findRecentJobs('user-1', {});

      expect(result.jobs).toEqual(jobs);
    });
  });
});
