/**
 * OmniClip Extension Service Worker
 *
 * Responsibilities:
 * 1. Receive CONTENT_COLLECTED messages from bridge scripts
 * 2. Buffer items in chrome.storage.local via sync-buffer
 * 3. Schedule periodic sync via chrome.alarms
 * 4. On alarm: POST buffered items to /api/v1/sync/extension
 * 5. Handle errors with exponential backoff
 * 6. Report health via /api/v1/sync/heartbeat
 * 7. Respond to popup queries for status info
 */

import {
  addItems,
  getItems,
  clearItems,
  clearSyncedItems,
  getBufferState,
  incrementErrorCount,
  getBackoffSeconds,
  shouldStopRetrying,
} from './sync-buffer';
import type { ContentItemInput } from '@omniclip/shared';
import type { PlatformId } from '@omniclip/shared';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const ALARM_NAME_PREFIX = 'omniclip-sync-';
const DEFAULT_SYNC_INTERVAL_MINUTES = 60;
const STORAGE_KEYS = {
  USER_TOKEN: 'user_token',
  CONNECTIONS: 'connections',
  BACKEND_URL: 'backend_url',
} as const;

const DEFAULT_BACKEND_URL = 'http://localhost:3001';

// ──────────────────────────────────────────────
// Storage helpers
// ──────────────────────────────────────────────

interface ConnectionConfig {
  id: string;
  interval: number; // minutes
}

type ConnectionsMap = Partial<Record<PlatformId, ConnectionConfig>>;

async function getUserToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.USER_TOKEN);
  return (result[STORAGE_KEYS.USER_TOKEN] as string) ?? null;
}

async function getConnections(): Promise<ConnectionsMap> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTIONS);
  return (result[STORAGE_KEYS.CONNECTIONS] as ConnectionsMap) ?? {};
}

async function getBackendUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BACKEND_URL);
  return (result[STORAGE_KEYS.BACKEND_URL] as string) ?? DEFAULT_BACKEND_URL;
}

// ──────────────────────────────────────────────
// Message handling
// ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CONTENT_COLLECTED') {
    handleContentCollected(message.platform as PlatformId, message.items as ContentItemInput[])
      .then(() => sendResponse({ received: true }))
      .catch((err) => {
        console.error('[OmniClip SW] Failed to buffer items:', err);
        sendResponse({ received: false, error: String(err) });
      });
    return true; // async response
  }

  if (message.type === 'POPUP_GET_STATUS') {
    handleGetStatus()
      .then((status) => sendResponse(status))
      .catch((err) => {
        console.error('[OmniClip SW] Failed to get status:', err);
        sendResponse({ error: String(err) });
      });
    return true;
  }

  if (message.type === 'POPUP_MANUAL_SYNC') {
    handleManualSync(message.platform as PlatformId)
      .then((result) => sendResponse(result))
      .catch((err) => {
        console.error('[OmniClip SW] Manual sync failed:', err);
        sendResponse({ success: false, error: String(err) });
      });
    return true;
  }

  if (message.type === 'POPUP_LOGIN') {
    handleLogin(message.token as string, message.backendUrl as string | undefined)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  if (message.type === 'POPUP_LOGOUT') {
    handleLogout()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  return false;
});

/**
 * Buffer newly collected content items and ensure sync alarm is scheduled.
 */
async function handleContentCollected(
  platform: PlatformId,
  items: ContentItemInput[],
): Promise<void> {
  if (!items || items.length === 0) return;

  await addItems(platform, items);
  console.log(`[OmniClip SW] Buffered ${items.length} ${platform} items`);

  // Ensure alarm is scheduled
  await ensureSyncAlarm(platform);
}

/**
 * Get status for the popup UI.
 */
async function handleGetStatus(): Promise<{
  loggedIn: boolean;
  platforms: Record<
    string,
    {
      connectionId: string | null;
      itemsBuffered: number;
      lastSync: number;
      errorCount: number;
      status: string;
    }
  >;
}> {
  // Fire and forget connection refresh to keep them up to date in background
  refreshConnections().catch(console.error);

  const token = await getUserToken();
  const connections = await getConnections();

  const platforms: Record<
    string,
    {
      connectionId: string | null;
      itemsBuffered: number;
      lastSync: number;
      errorCount: number;
      status: string;
    }
  > = {};

  for (const platform of ['xiaohongshu', 'twitter'] as PlatformId[]) {
    const state = await getBufferState(platform);
    const conn = connections[platform];
    let status = 'disconnected';
    if (conn) {
      status = shouldStopRetrying(state.error_count) ? 'error' : 'active';
    }
    platforms[platform] = {
      connectionId: conn?.id ?? null,
      itemsBuffered: state.items_count,
      lastSync: state.last_sync,
      errorCount: state.error_count,
      status,
    };
  }

  return { loggedIn: !!token, platforms };
}

async function refreshConnections(): Promise<void> {
  const token = await getUserToken();
  if (!token) return;
  const backendUrl = await getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/v1/connections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = await response.json();
      const newConns: ConnectionsMap = {};
      for (const conn of data.connections) {
        if (conn.connection_type === 'extension' && conn.status === 'active') {
          newConns[conn.platform as PlatformId] = {
            id: conn.id,
            interval: conn.sync_interval_minutes,
          };
        }
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: newConns });

      // Ensure alarms and trigger an immediate initial sync/heartbeat
      for (const platform of Object.keys(newConns) as PlatformId[]) {
        await ensureSyncAlarm(platform);
        // Fire and forget initial sync to mark connection as healthy
        syncPlatform(platform).catch((err) =>
          console.error(`[OmniClip SW] Initial sync failed for ${platform}:`, err),
        );
      }
    }
  } catch (err) {
    console.error('[OmniClip SW] Failed to refresh connections:', err);
  }
}

/**
 * Handle manual sync trigger from popup.
 */
async function handleManualSync(
  platform: PlatformId,
): Promise<{ success: boolean; error?: string }> {
  try {
    await syncPlatform(platform);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Store auth token and optionally backend URL.
 */
async function handleLogin(token: string, backendUrl?: string): Promise<void> {
  const data: Record<string, unknown> = {
    [STORAGE_KEYS.USER_TOKEN]: token,
  };
  if (backendUrl) {
    data[STORAGE_KEYS.BACKEND_URL] = backendUrl;
  }
  await chrome.storage.local.set(data);
  await refreshConnections();
}

/**
 * Clear auth token and stop all alarms.
 */
async function handleLogout(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.USER_TOKEN]);
  await chrome.alarms.clearAll();
}

// ──────────────────────────────────────────────
// Alarm-based sync scheduling
// ──────────────────────────────────────────────

/**
 * Ensure a sync alarm exists for the given platform.
 * Uses the connection's configured interval, defaulting to 60 minutes.
 */
async function ensureSyncAlarm(platform: PlatformId): Promise<void> {
  const alarmName = `${ALARM_NAME_PREFIX}${platform}`;
  const existing = await chrome.alarms.get(alarmName);
  if (existing) return; // Already scheduled

  const connections = await getConnections();
  const interval = connections[platform]?.interval ?? DEFAULT_SYNC_INTERVAL_MINUTES;

  // Check if we need backoff
  const state = await getBufferState(platform);
  if (shouldStopRetrying(state.error_count)) {
    console.warn(`[OmniClip SW] ${platform} exceeded max retries, not scheduling alarm`);
    return;
  }

  let delayMinutes = interval;
  if (state.error_count > 0) {
    const backoffSeconds = getBackoffSeconds(state.error_count);
    delayMinutes = Math.max(backoffSeconds / 60, 1);
  }

  chrome.alarms.create(alarmName, {
    delayInMinutes: delayMinutes,
  });

  console.log(`[OmniClip SW] Scheduled ${platform} sync in ${delayMinutes} minutes`);
}

/**
 * Handle alarm fires — trigger sync for the corresponding platform.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_NAME_PREFIX)) return;

  const platform = alarm.name.slice(ALARM_NAME_PREFIX.length) as PlatformId;
  console.log(`[OmniClip SW] Alarm fired for ${platform}, starting sync`);

  try {
    await syncPlatform(platform);
  } catch (err) {
    console.error(`[OmniClip SW] Sync failed for ${platform}:`, err);
  }

  // Re-schedule the next sync (alarm is non-repeating to support backoff)
  await ensureSyncAlarm(platform);
});

// ──────────────────────────────────────────────
// Sync execution
// ──────────────────────────────────────────────

/**
 * Sync buffered items for a platform to the backend.
 */
async function syncPlatform(platform: PlatformId): Promise<void> {
  const token = await getUserToken();
  if (!token) {
    console.warn('[OmniClip SW] No auth token, skipping sync');
    return;
  }

  const connections = await getConnections();
  const connection = connections[platform];
  if (!connection) {
    console.warn(`[OmniClip SW] No connection for ${platform}, skipping sync`);
    return;
  }

  const items = await getItems(platform);
  if (items.length === 0) {
    console.log(`[OmniClip SW] No items to sync for ${platform}`);
    // Send heartbeat anyway to let backend know we are alive
    await sendHeartbeat(platform, connection.id, 'active');
    return;
  }

  const backendUrl = await getBackendUrl();
  const url = `${backendUrl}/api/v1/sync/extension`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version,
        'X-Platform': platform,
      },
      body: JSON.stringify({
        platform,
        connection_id: connection.id,
        items: items.map(serializeItem),
        sync_metadata: {
          collected_at: new Date().toISOString(),
          items_in_buffer: items.length,
          extension_version: chrome.runtime.getManifest().version,
        },
      }),
    });

    if (response.status === 401) {
      // Token expired — clear it so popup shows login prompt
      await chrome.storage.local.remove([STORAGE_KEYS.USER_TOKEN]);
      console.warn('[OmniClip SW] Auth token expired, cleared');
      return;
    }

    if (response.status === 429) {
      // Rate limited — increment error count and respect Retry-After
      await incrementErrorCount(platform);
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        console.warn(`[OmniClip SW] Rate limited, retry after ${retryAfter}s`);
      }
      return;
    }

    if (!response.ok && response.status !== 207) {
      throw new Error(`Sync failed with status ${response.status}`);
    }

    const result = (await response.json()) as {
      accepted: number;
      duplicates_updated: number;
      errors: Array<{ external_id: string; error: string; message: string }>;
    };

    console.log(
      `[OmniClip SW] Sync result for ${platform}: ` +
        `accepted=${result.accepted}, duplicates=${result.duplicates_updated}, errors=${result.errors.length}`,
    );

    if (result.errors.length === 0) {
      // Full success — clear entire buffer
      await clearItems(platform);
    } else {
      // Partial success — clear only accepted items
      const errorIds = new Set(result.errors.map((e) => e.external_id));
      const syncedIds = items.map((i) => i.external_id).filter((id) => !errorIds.has(id));
      await clearSyncedItems(platform, syncedIds);
    }

    // Send heartbeat on successful sync
    await sendHeartbeat(platform, connection.id, 'active');
  } catch (err) {
    console.error(`[OmniClip SW] Sync error for ${platform}:`, err);
    await incrementErrorCount(platform);

    const state = await getBufferState(platform);
    if (shouldStopRetrying(state.error_count)) {
      // Report error via heartbeat
      await sendHeartbeat(platform, connection.id, 'error', String(err));
    }
  }
}

/**
 * Serialize a ContentItemInput for JSON transport.
 * Converts Date objects to ISO strings.
 */
function serializeItem(item: ContentItemInput): Record<string, unknown> {
  return {
    ...item,
    published_at:
      item.published_at instanceof Date ? item.published_at.toISOString() : item.published_at,
  };
}

/**
 * Send a heartbeat to the backend reporting extension health.
 */
async function sendHeartbeat(
  platform: PlatformId,
  connectionId: string,
  status: 'active' | 'error',
  errorMessage?: string,
): Promise<void> {
  const token = await getUserToken();
  if (!token) return;

  const backendUrl = await getBackendUrl();
  const url = `${backendUrl}/api/v1/sync/heartbeat`;

  try {
    const state = await getBufferState(platform);
    const body: Record<string, unknown> = {
      connection_id: connectionId,
      platform,
      status,
      last_collection_at: state.last_sync > 0 ? new Date(state.last_sync).toISOString() : null,
      items_buffered: state.items_count,
    };

    if (status === 'error' && errorMessage) {
      body.error_type = 'sync_failed';
      body.error_message = errorMessage;
    }

    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Heartbeat failures are non-critical
    console.debug('[OmniClip SW] Heartbeat failed:', err);
  }
}

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

console.log('[OmniClip SW] Service worker initialized');
