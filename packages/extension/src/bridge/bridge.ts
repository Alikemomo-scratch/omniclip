/**
 * Bridge script — runs in ISOLATED world.
 *
 * Relays content from MAIN world content scripts to the service worker.
 * This bridge is platform-agnostic — it forwards any AGGREGATOR_CONTENT
 * message regardless of platform.
 *
 * Flow: MAIN world (window.postMessage) → Bridge (chrome.runtime.sendMessage) → Service Worker
 *
 * Security: Only relays messages with source === 'aggregator-main' to prevent
 * other scripts from injecting data into our pipeline.
 */

interface AggregatorMessage {
  type: 'AGGREGATOR_CONTENT';
  source: 'aggregator-main';
  payload: {
    platform: string;
    items: unknown[];
  };
}

function isAggregatorMessage(data: unknown): data is AggregatorMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.type === 'AGGREGATOR_CONTENT' &&
    msg.source === 'aggregator-main' &&
    msg.payload !== null &&
    typeof msg.payload === 'object'
  );
}

/**
 * Listen for postMessage from MAIN world content scripts.
 */
window.addEventListener('message', (event: MessageEvent) => {
  // Only accept messages from the same window (same frame)
  if (event.source !== window) return;

  const data = event.data;
  if (!isAggregatorMessage(data)) return;

  const { platform, items } = data.payload;

  // Relay to service worker via chrome.runtime.sendMessage
  chrome.runtime.sendMessage(
    {
      type: 'CONTENT_COLLECTED',
      platform,
      items,
      timestamp: Date.now(),
    },
    (response) => {
      if (chrome.runtime.lastError) {
        // Service worker might be inactive — message will be lost
        // but content scripts will re-intercept on next feed load
        console.debug(
          '[OmniClip Bridge] Failed to relay to service worker:',
          chrome.runtime.lastError.message,
        );
        return;
      }
      if (response?.received) {
        console.debug(
          `[OmniClip Bridge] Relayed ${items.length} ${platform} items to service worker`,
        );
      }
    },
  );
});
