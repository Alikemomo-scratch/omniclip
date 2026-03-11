import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncProcessor } from './sync.processor';
import type { SyncJobData } from './sync.processor';
import type { Job } from 'bullmq';
import { ConnectorError } from '../connectors/interfaces/connector-error';

// Helper: create a mock job
function createMockJob(data: Partial<SyncJobData> = {}): Job<SyncJobData> {
  return {
    id: 'job-1',
    data: {
      connectionId: 'conn-1',
      userId: 'user-1',
      platform: 'github',
      ...data,
    },
    updateProgress: vi.fn(),
  } as unknown as Job<SyncJobData>;
}

// Helper: create mock connection data (as returned by findByIdWithAuth)
function createMockConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    userId: 'user-1',
    platform: 'github',
    connectionType: 'api',
    status: 'active',
    authData: { personal_access_token: 'ghp_test123' },
    syncIntervalMinutes: 60,
    lastSyncAt: null,
    lastError: null,
    errorCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SyncProcessor', () => {
  let processor: SyncProcessor;
  let mockConnectionsService: {
    findByIdWithAuth: ReturnType<typeof vi.fn>;
  };
  let mockContentService: {
    upsertMany: ReturnType<typeof vi.fn>;
  };
  let mockConnectorRegistry: {
    get: ReturnType<typeof vi.fn>;
  };
  let mockDb: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let mockTx: {
    update: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    values: ReturnType<typeof vi.fn>;
    returning: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConnectionsService = {
      findByIdWithAuth: vi.fn(),
    };
    mockContentService = {
      upsertMany: vi.fn(),
    };
    mockConnectorRegistry = {
      get: vi.fn(),
    };
    mockTx = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'sj-1' }]),
      execute: vi.fn(),
    };
    mockDb = {
      transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };

    processor = new SyncProcessor(
      mockConnectionsService as any,
      mockContentService as any,
      mockConnectorRegistry as any,
      mockDb as any,
    );
  });

  it('should fetch connection, call connector, upsert items, and create sync record', async () => {
    const connection = createMockConnection();
    mockConnectionsService.findByIdWithAuth.mockResolvedValue(connection);

    const fetchResult = {
      items: [
        {
          external_id: 'ext-1',
          content_type: 'release',
          title: 'v1.0',
          body: 'Notes',
          media_urls: [],
          metadata: {},
          author_name: 'octocat',
          author_url: 'https://github.com/octocat',
          original_url: 'https://github.com/repo/releases/v1.0',
          published_at: new Date('2026-03-10'),
        },
      ],
      has_more: false,
      metadata: { api_calls_made: 2 },
    };
    const mockConnector = {
      fetchContent: vi.fn().mockResolvedValue(fetchResult),
    };
    mockConnectorRegistry.get.mockReturnValue(mockConnector);
    mockContentService.upsertMany.mockResolvedValue(1);

    const job = createMockJob();
    await processor.process(job);

    // Verify: fetched connection with auth
    expect(mockConnectionsService.findByIdWithAuth).toHaveBeenCalledWith('user-1', 'conn-1');

    // Verify: got connector from registry
    expect(mockConnectorRegistry.get).toHaveBeenCalledWith('github');

    // Verify: called fetchContent with connection data and since=null
    expect(mockConnector.fetchContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-1', platform: 'github' }),
      null, // last_sync_at is null
    );

    // Verify: upserted content items
    expect(mockContentService.upsertMany).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          connectionId: 'conn-1',
          platform: 'github',
          externalId: 'ext-1',
        }),
      ]),
    );

    // Verify: created sync_job record and updated last_sync_at (via db.transaction)
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled();
  });

  it('should pass last_sync_at as since when present', async () => {
    const lastSync = new Date('2026-03-09T12:00:00Z');
    const connection = createMockConnection({ lastSyncAt: lastSync });
    mockConnectionsService.findByIdWithAuth.mockResolvedValue(connection);

    const mockConnector = {
      fetchContent: vi.fn().mockResolvedValue({
        items: [],
        has_more: false,
        metadata: { api_calls_made: 1 },
      }),
    };
    mockConnectorRegistry.get.mockReturnValue(mockConnector);
    mockContentService.upsertMany.mockResolvedValue(0);

    await processor.process(createMockJob());

    expect(mockConnector.fetchContent).toHaveBeenCalledWith(expect.anything(), lastSync);
  });

  it('should handle AUTH_EXPIRED error — mark connection as error, create failed sync record', async () => {
    const connection = createMockConnection();
    mockConnectionsService.findByIdWithAuth.mockResolvedValue(connection);

    const error = new ConnectorError('github', 'AUTH_EXPIRED', 'Token expired', false);
    const mockConnector = { fetchContent: vi.fn().mockRejectedValue(error) };
    mockConnectorRegistry.get.mockReturnValue(mockConnector);

    const job = createMockJob();
    // AUTH_EXPIRED is not retryable, so process should complete without throwing
    await processor.process(job);

    // Should have created a failed sync record and updated connection status
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled();
  });

  it('should handle RATE_LIMITED error — throw to trigger BullMQ retry', async () => {
    const connection = createMockConnection();
    mockConnectionsService.findByIdWithAuth.mockResolvedValue(connection);

    const error = new ConnectorError('github', 'RATE_LIMITED', 'Rate limited', true);
    const mockConnector = { fetchContent: vi.fn().mockRejectedValue(error) };
    mockConnectorRegistry.get.mockReturnValue(mockConnector);

    const job = createMockJob();
    // RATE_LIMITED is retryable, so process should re-throw for BullMQ retry
    await expect(processor.process(job)).rejects.toThrow('Rate limited');
  });

  it('should handle generic errors — create failed sync record and re-throw', async () => {
    const connection = createMockConnection();
    mockConnectionsService.findByIdWithAuth.mockResolvedValue(connection);

    const error = new Error('Network failure');
    const mockConnector = { fetchContent: vi.fn().mockRejectedValue(error) };
    mockConnectorRegistry.get.mockReturnValue(mockConnector);

    const job = createMockJob();
    await expect(processor.process(job)).rejects.toThrow('Network failure');

    // Should still record the failure
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});
