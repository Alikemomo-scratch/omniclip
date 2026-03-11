/**
 * Twitter/X content script — runs in MAIN world at document_start.
 *
 * Intercepts fetch responses from Twitter's GraphQL API (/graphql/)
 * to capture timeline content without DOM manipulation.
 *
 * Security constraints (FR-022):
 * - MUST NOT mutate DOM
 * - MUST NOT simulate clicks
 * - MUST NOT make additional network requests
 * - MUST NOT access or transmit platform credentials
 * - Read-only passive interception only
 */

import { parseTwitterTimeline } from './parser';

const GRAPHQL_URL_PATTERN = '/graphql/';
// Only intercept timeline-related queries, not all GraphQL requests
const TIMELINE_OPERATIONS = ['HomeTimeline', 'HomeLatestTimeline', 'ForYou'];

// Save original fetch and toString for stealth
const originalFetch = window.fetch;
const originalToString = Function.prototype.toString;

/**
 * Post intercepted content items to the bridge script (ISOLATED world)
 * via window.postMessage. The bridge relays to the service worker.
 */
function postToBridge(items: unknown[]): void {
  if (items.length === 0) return;

  window.postMessage(
    {
      type: 'AGGREGATOR_CONTENT',
      source: 'aggregator-main',
      payload: {
        platform: 'twitter',
        items,
      },
    },
    '*',
  );
}

/**
 * Check if a GraphQL URL is for a timeline operation we want to intercept.
 */
function isTimelineRequest(url: string): boolean {
  if (!url.includes(GRAPHQL_URL_PATTERN)) return false;
  return TIMELINE_OPERATIONS.some((op) => url.includes(op));
}

/**
 * Patched fetch that intercepts Twitter GraphQL timeline responses.
 * Clones the response so the original page functionality is unaffected.
 */
const patchedFetch: typeof window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await originalFetch.call(window, input, init);

  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (isTimelineRequest(url)) {
      const cloned = response.clone();
      cloned
        .json()
        .then((data: unknown) => {
          const items = parseTwitterTimeline(data);
          postToBridge(items);
        })
        .catch(() => {
          // Silently fail — never break the page
        });
    }
  } catch {
    // Silently fail — interception errors must never affect the page
  }

  return response;
};

// Apply the fetch patch
window.fetch = patchedFetch;

/**
 * Stealth: patch Function.prototype.toString so our patched fetch
 * returns the same string as the original, avoiding detection.
 */
Function.prototype.toString = function (this: Function): string {
  if (this === patchedFetch) {
    return originalToString.call(originalFetch);
  }
  return originalToString.call(this);
};
