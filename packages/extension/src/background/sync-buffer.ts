import type { ContentItemInput } from '@omniclip/shared';
import type { PlatformId } from '@omniclip/shared';

/**
 * Maximum number of items stored per platform buffer.
 * When exceeded, oldest items are dropped first.
 */
export const MAX_BUFFER_SIZE = 500;

/**
 * Maximum consecutive errors before we stop retrying.
 */
const MAX_ERROR_COUNT = 5;

/**
 * Storage key for the sync buffer in chrome.storage.local.
 */
const STORAGE_KEY = 'sync_buffer';

/**
 * Per-platform buffer structure stored in chrome.storage.local.
 */
interface PlatformBuffer {
  items: ContentItemInput[];
  last_sync: number; // timestamp ms
  error_count: number;
}

type SyncBufferStorage = Record<string, PlatformBuffer>;

/**
 * Read the full sync buffer from chrome.storage.local.
 */
async function readBuffer(): Promise<SyncBufferStorage> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as SyncBufferStorage) ?? {};
}

/**
 * Write the full sync buffer to chrome.storage.local.
 */
async function writeBuffer(buffer: SyncBufferStorage): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: buffer });
}

/**
 * Get or create the platform-specific buffer.
 */
function getPlatformBuffer(buffer: SyncBufferStorage, platform: string): PlatformBuffer {
  return buffer[platform] ?? { items: [], last_sync: 0, error_count: 0 };
}

/**
 * Add content items to the buffer for a specific platform.
 * - Deduplicates by external_id (newer items replace older ones)
 * - Enforces MAX_BUFFER_SIZE by dropping oldest items
 */
export async function addItems(platform: PlatformId, items: ContentItemInput[]): Promise<void> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);

  // Build a map of existing items for O(1) dedup lookup
  const itemMap = new Map<string, ContentItemInput>();
  for (const existing of platformBuffer.items) {
    itemMap.set(existing.external_id, existing);
  }

  // Add new items (overwriting duplicates)
  for (const item of items) {
    itemMap.set(item.external_id, item);
  }

  // Convert back to array
  let allItems = Array.from(itemMap.values());

  // Enforce max buffer size — drop oldest (from the front)
  if (allItems.length > MAX_BUFFER_SIZE) {
    allItems = allItems.slice(allItems.length - MAX_BUFFER_SIZE);
  }

  platformBuffer.items = allItems;
  buffer[platform] = platformBuffer;
  await writeBuffer(buffer);
}

/**
 * Get all buffered items for a specific platform.
 */
export async function getItems(platform: PlatformId): Promise<ContentItemInput[]> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);
  return platformBuffer.items;
}

/**
 * Clear all items for a specific platform and reset error state.
 * Used after a successful full sync.
 */
export async function clearItems(platform: PlatformId): Promise<void> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);
  platformBuffer.items = [];
  platformBuffer.error_count = 0;
  platformBuffer.last_sync = Date.now();
  buffer[platform] = platformBuffer;
  await writeBuffer(buffer);
}

/**
 * Remove specific items from the buffer by their external_id values.
 * Used for partial sync success (some items accepted, others failed).
 */
export async function clearSyncedItems(platform: PlatformId, syncedIds: string[]): Promise<void> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);

  const idsToRemove = new Set(syncedIds);
  platformBuffer.items = platformBuffer.items.filter((item) => !idsToRemove.has(item.external_id));

  buffer[platform] = platformBuffer;
  await writeBuffer(buffer);
}

/**
 * Get the current buffer state for a platform (item count, last sync, error count).
 */
export async function getBufferState(
  platform: PlatformId,
): Promise<{ items_count: number; last_sync: number; error_count: number }> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);
  return {
    items_count: platformBuffer.items.length,
    last_sync: platformBuffer.last_sync,
    error_count: platformBuffer.error_count,
  };
}

/**
 * Increment the error count for a platform.
 * Called after a failed sync attempt.
 */
export async function incrementErrorCount(platform: PlatformId): Promise<void> {
  const buffer = await readBuffer();
  const platformBuffer = getPlatformBuffer(buffer, platform);
  platformBuffer.error_count += 1;
  buffer[platform] = platformBuffer;
  await writeBuffer(buffer);
}

/**
 * Calculate exponential backoff delay in seconds.
 * Formula: min(2^errorCount * 60, 3600) — caps at 1 hour.
 */
export function getBackoffSeconds(errorCount: number): number {
  return Math.min(Math.pow(2, errorCount) * 60, 3600);
}

/**
 * Check if we should stop retrying based on consecutive error count.
 * After 5 consecutive failures, we should mark the connection as error via heartbeat.
 */
export function shouldStopRetrying(errorCount: number): boolean {
  return errorCount >= MAX_ERROR_COUNT;
}
