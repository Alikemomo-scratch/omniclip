import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ContentService } from './content.service';

// Mock Drizzle query builder — mirrors the pattern used in connections tests
function createMockDb() {
  const mockTx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    execute: vi.fn(),
  };

  const db = {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
      return cb(mockTx);
    }),
  };

  return { db, mockTx };
}

describe('ContentService', () => {
  let service: ContentService;
  let db: ReturnType<typeof createMockDb>['db'];
  let mockTx: ReturnType<typeof createMockDb>['mockTx'];

  beforeEach(() => {
    const mocks = createMockDb();
    db = mocks.db;
    mockTx = mocks.mockTx;
    service = new ContentService(db as any);
  });

  // -----------------------------------------------------------
  // findAll — paginated feed query with filters
  // -----------------------------------------------------------
  describe('findAll', () => {
    /**
     * Helper: set up mocks for findAll (count query via .where(), data query via .offset()).
     * Chain: select().from().where() for count, select().from().where().orderBy().limit().offset() for data.
     * When no filters: .where(undefined) is still called.
     */
    function setupFindAllMocks(total: number, items: unknown[] = []) {
      // Count query: select().from().where() → resolves with [{count}]
      // Data query:  select().from().where().orderBy().limit().offset() → resolves with items
      // Since .where() is called twice (count + data), we need two resolved values.
      // First .where() call resolves for count, second chains to orderBy for data.
      mockTx.where
        .mockResolvedValueOnce([{ count: total }]) // count query
        .mockReturnValueOnce(mockTx); // data query (chains to orderBy)
      mockTx.offset.mockResolvedValueOnce(items);
    }

    it('should return paginated content with defaults (page=1, limit=20)', async () => {
      const items = [
        {
          id: 'item-1',
          platform: 'github',
          content_type: 'release',
          title: 'v1.0',
          published_at: new Date('2026-03-10'),
        },
      ];
      setupFindAllMocks(42, items);

      const result = await service.findAll('user-1', {});

      expect(result.items).toEqual(items);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 42,
        total_pages: 3, // ceil(42/20)
      });
      expect(db.transaction).toHaveBeenCalledOnce();
    });

    it('should apply page and limit parameters', async () => {
      setupFindAllMocks(100);

      const result = await service.findAll('user-1', { page: 3, limit: 10 });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 100,
        total_pages: 10,
      });
    });

    it('should return empty items when no content exists', async () => {
      setupFindAllMocks(0);

      const result = await service.findAll('user-1', {});

      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.total_pages).toBe(0);
    });

    it('should accept platform filter', async () => {
      setupFindAllMocks(5);

      const result = await service.findAll('user-1', { platform: 'github' });

      expect(result.pagination.total).toBe(5);
    });

    it('should accept content_type filter', async () => {
      setupFindAllMocks(3);

      const result = await service.findAll('user-1', { content_type: 'release' });

      expect(result.pagination.total).toBe(3);
    });

    it('should accept date range filters (from/to)', async () => {
      setupFindAllMocks(10);

      const result = await service.findAll('user-1', {
        from: '2026-03-01',
        to: '2026-03-10',
      });

      expect(result.pagination.total).toBe(10);
    });

    it('should accept search filter', async () => {
      setupFindAllMocks(2);

      const result = await service.findAll('user-1', { search: 'release' });

      expect(result.pagination.total).toBe(2);
    });
  });

  // -----------------------------------------------------------
  // findById — single content item
  // -----------------------------------------------------------
  describe('findById', () => {
    it('should return a single content item', async () => {
      const item = {
        id: 'item-1',
        platform: 'github',
        content_type: 'release',
        title: 'v1.0',
        body: 'Release notes',
        author_name: 'octocat',
        author_url: 'https://github.com/octocat',
        original_url: 'https://github.com/repo/releases/v1.0',
        media_urls: [],
        metadata: {},
        published_at: new Date('2026-03-10'),
        collected_at: new Date('2026-03-10'),
        ai_summary: null,
      };
      mockTx.where.mockResolvedValueOnce([item]);

      const result = await service.findById('user-1', 'item-1');
      expect(result).toEqual(item);
    });

    it('should throw NotFoundException when item does not exist', async () => {
      mockTx.where.mockResolvedValueOnce([]);

      await expect(service.findById('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------
  // upsertMany — batch upsert with deduplication
  // -----------------------------------------------------------
  describe('upsertMany', () => {
    it('should upsert multiple content items and return count', async () => {
      const inputItems = [
        {
          connectionId: 'conn-1',
          platform: 'github',
          externalId: 'ext-1',
          contentType: 'release',
          title: 'v1.0',
          body: 'Notes',
          originalUrl: 'https://github.com/repo/releases/v1.0',
          publishedAt: new Date('2026-03-10'),
          authorName: 'octocat',
          authorUrl: 'https://github.com/octocat',
          mediaUrls: [],
          metadata: {},
        },
        {
          connectionId: 'conn-1',
          platform: 'github',
          externalId: 'ext-2',
          contentType: 'push',
          title: 'Fix bug',
          body: 'Commit details',
          originalUrl: 'https://github.com/repo/commit/abc',
          publishedAt: new Date('2026-03-09'),
          authorName: 'dev',
          authorUrl: 'https://github.com/dev',
          mediaUrls: [],
          metadata: {},
        },
      ];

      // returning resolves with the upserted rows
      mockTx.returning.mockResolvedValueOnce([{ id: 'item-1' }, { id: 'item-2' }]);

      const count = await service.upsertMany('user-1', inputItems);
      expect(count).toBe(2);
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('should return 0 when given empty array', async () => {
      const count = await service.upsertMany('user-1', []);
      expect(count).toBe(0);
    });
  });
});
