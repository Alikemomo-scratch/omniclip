import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ContentItemInput } from '@omniclip/shared';

/**
 * Mock chrome.storage.local for unit testing.
 * Simulates the Chrome storage API with an in-memory store.
 */
function createMockChromeStorage() {
  let store: Record<string, unknown> = {};

  return {
    get: vi.fn((keys: string | string[] | null) => {
      if (keys === null) return Promise.resolve({ ...store });
      const keyList = typeof keys === 'string' ? [keys] : keys;
      const result: Record<string, unknown> = {};
      for (const key of keyList) {
        if (key in store) result[key] = store[key];
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyList) {
        delete store[key];
      }
      return Promise.resolve();
    }),
    _reset: () => {
      store = {};
    },
    _getStore: () => store,
  };
}

// Must set up chrome mock BEFORE importing sync-buffer
let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: mockStorage,
    },
  };
});

// Lazy import so chrome mock is set before module loads
async function importSyncBuffer() {
  // Clear module cache to get fresh imports with current mock
  vi.resetModules();
  return import('../../src/background/sync-buffer');
}

function makeItem(overrides: Partial<ContentItemInput> = {}): ContentItemInput {
  return {
    external_id: `item-${Math.random().toString(36).slice(2, 8)}`,
    content_type: 'post',
    title: 'Test Title',
    body: 'Test body',
    media_urls: [],
    metadata: {},
    author_name: 'Author',
    author_url: 'https://example.com/author',
    original_url: 'https://example.com/post/1',
    published_at: new Date('2024-03-10T06:00:00Z'),
    ...overrides,
  };
}

describe('SyncBuffer', () => {
  describe('addItems', () => {
    it('should add items to an empty buffer for a platform', async () => {
      const { addItems, getItems } = await importSyncBuffer();

      const items = [makeItem({ external_id: 'xhs-1' }), makeItem({ external_id: 'xhs-2' })];
      await addItems('xiaohongshu', items);

      const buffered = await getItems('xiaohongshu');
      expect(buffered).toHaveLength(2);
      expect(buffered[0].external_id).toBe('xhs-1');
      expect(buffered[1].external_id).toBe('xhs-2');
    });

    it('should append items to existing buffer', async () => {
      const { addItems, getItems } = await importSyncBuffer();

      await addItems('xiaohongshu', [makeItem({ external_id: 'xhs-1' })]);
      await addItems('xiaohongshu', [makeItem({ external_id: 'xhs-2' })]);

      const buffered = await getItems('xiaohongshu');
      expect(buffered).toHaveLength(2);
    });

    it('should keep platform buffers isolated', async () => {
      const { addItems, getItems } = await importSyncBuffer();

      await addItems('xiaohongshu', [makeItem({ external_id: 'xhs-1' })]);
      await addItems('twitter', [
        makeItem({ external_id: 'tw-1' }),
        makeItem({ external_id: 'tw-2' }),
      ]);

      const xhsItems = await getItems('xiaohongshu');
      const twItems = await getItems('twitter');
      expect(xhsItems).toHaveLength(1);
      expect(twItems).toHaveLength(2);
    });

    it('should deduplicate items within the buffer by external_id', async () => {
      const { addItems, getItems } = await importSyncBuffer();

      const item1 = makeItem({ external_id: 'xhs-dup', title: 'Original' });
      const item2 = makeItem({ external_id: 'xhs-dup', title: 'Updated' });

      await addItems('xiaohongshu', [item1]);
      await addItems('xiaohongshu', [item2]);

      const buffered = await getItems('xiaohongshu');
      expect(buffered).toHaveLength(1);
      // The newer item should replace the old one
      expect(buffered[0].title).toBe('Updated');
    });

    it('should enforce max buffer size of 500 items (drop oldest)', async () => {
      const { addItems, getItems, MAX_BUFFER_SIZE } = await importSyncBuffer();

      expect(MAX_BUFFER_SIZE).toBe(500);

      // Add 500 items
      const items = Array.from({ length: 500 }, (_, i) =>
        makeItem({ external_id: `item-${i.toString().padStart(4, '0')}` }),
      );
      await addItems('xiaohongshu', items);

      // Add 10 more (should drop the 10 oldest)
      const newItems = Array.from({ length: 10 }, (_, i) => makeItem({ external_id: `new-${i}` }));
      await addItems('xiaohongshu', newItems);

      const buffered = await getItems('xiaohongshu');
      expect(buffered).toHaveLength(500);

      // Oldest items should be gone
      const ids = buffered.map((b) => b.external_id);
      expect(ids).not.toContain('item-0000');
      expect(ids).not.toContain('item-0009');
      // Newest items should be present
      expect(ids).toContain('new-0');
      expect(ids).toContain('new-9');
      // Items just above the cutoff should still be present
      expect(ids).toContain('item-0010');
    });
  });

  describe('getItems', () => {
    it('should return empty array for platform with no buffered items', async () => {
      const { getItems } = await importSyncBuffer();

      const items = await getItems('xiaohongshu');
      expect(items).toEqual([]);
    });
  });

  describe('clearItems', () => {
    it('should clear all items for a specific platform', async () => {
      const { addItems, clearItems, getItems } = await importSyncBuffer();

      await addItems('xiaohongshu', [makeItem({ external_id: 'xhs-1' })]);
      await addItems('twitter', [makeItem({ external_id: 'tw-1' })]);

      await clearItems('xiaohongshu');

      const xhsItems = await getItems('xiaohongshu');
      const twItems = await getItems('twitter');
      expect(xhsItems).toEqual([]);
      expect(twItems).toHaveLength(1); // twitter untouched
    });

    it('should reset error_count and update last_sync on clear', async () => {
      const { addItems, clearItems, getBufferState } = await importSyncBuffer();

      await addItems('xiaohongshu', [makeItem()]);
      await clearItems('xiaohongshu');

      const state = await getBufferState('xiaohongshu');
      expect(state.error_count).toBe(0);
      expect(state.last_sync).toBeGreaterThan(0);
    });
  });

  describe('clearSyncedItems', () => {
    it('should clear only the specified item IDs', async () => {
      const { addItems, clearSyncedItems, getItems } = await importSyncBuffer();

      await addItems('xiaohongshu', [
        makeItem({ external_id: 'xhs-1' }),
        makeItem({ external_id: 'xhs-2' }),
        makeItem({ external_id: 'xhs-3' }),
      ]);

      await clearSyncedItems('xiaohongshu', ['xhs-1', 'xhs-3']);

      const remaining = await getItems('xiaohongshu');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].external_id).toBe('xhs-2');
    });
  });

  describe('getBufferState', () => {
    it('should return default state for uninitialized platform', async () => {
      const { getBufferState } = await importSyncBuffer();

      const state = await getBufferState('xiaohongshu');
      expect(state).toEqual({
        items_count: 0,
        last_sync: 0,
        error_count: 0,
      });
    });

    it('should return correct item count', async () => {
      const { addItems, getBufferState } = await importSyncBuffer();

      await addItems('twitter', [makeItem(), makeItem(), makeItem()]);

      const state = await getBufferState('twitter');
      expect(state.items_count).toBe(3);
    });
  });

  describe('incrementErrorCount', () => {
    it('should increment error_count for a platform', async () => {
      const { incrementErrorCount, getBufferState } = await importSyncBuffer();

      await incrementErrorCount('xiaohongshu');
      const state1 = await getBufferState('xiaohongshu');
      expect(state1.error_count).toBe(1);

      await incrementErrorCount('xiaohongshu');
      const state2 = await getBufferState('xiaohongshu');
      expect(state2.error_count).toBe(2);
    });
  });

  describe('getBackoffSeconds', () => {
    it('should return exponential backoff based on error count', async () => {
      const { getBackoffSeconds } = await importSyncBuffer();

      // 2^0 * 60 = 60
      expect(getBackoffSeconds(0)).toBe(60);
      // 2^1 * 60 = 120
      expect(getBackoffSeconds(1)).toBe(120);
      // 2^2 * 60 = 240
      expect(getBackoffSeconds(2)).toBe(240);
      // 2^3 * 60 = 480
      expect(getBackoffSeconds(3)).toBe(480);
    });

    it('should cap at 3600 seconds (1 hour)', async () => {
      const { getBackoffSeconds } = await importSyncBuffer();

      // 2^10 * 60 = 61440, capped to 3600
      expect(getBackoffSeconds(10)).toBe(3600);
      // 2^6 * 60 = 3840, capped to 3600
      expect(getBackoffSeconds(6)).toBe(3600);
    });

    it('should return 3600 for exactly the cap boundary', async () => {
      const { getBackoffSeconds } = await importSyncBuffer();

      // 2^5 * 60 = 1920 (under cap)
      expect(getBackoffSeconds(5)).toBe(1920);
      // 2^6 * 60 = 3840 (over cap)
      expect(getBackoffSeconds(6)).toBe(3600);
    });
  });

  describe('shouldStopRetrying', () => {
    it('should return false when error_count < 5', async () => {
      const { shouldStopRetrying } = await importSyncBuffer();

      expect(shouldStopRetrying(0)).toBe(false);
      expect(shouldStopRetrying(4)).toBe(false);
    });

    it('should return true when error_count >= 5', async () => {
      const { shouldStopRetrying } = await importSyncBuffer();

      expect(shouldStopRetrying(5)).toBe(true);
      expect(shouldStopRetrying(10)).toBe(true);
    });
  });
});
