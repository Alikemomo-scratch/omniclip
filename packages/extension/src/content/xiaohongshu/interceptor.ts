/**
 * Xiaohongshu content script — runs in MAIN world at document_start.
 *
 * Intercepts fetch responses from /api/sns/web/v1/feed to capture
 * feed content without DOM manipulation or additional requests.
 *
 * Security constraints (FR-022):
 * - MUST NOT mutate DOM
 * - MUST NOT simulate clicks
 * - MUST NOT make additional network requests
 * - MUST NOT access or transmit platform credentials
 * - Read-only passive interception only
 */

import { parseXiaohongshuFeed } from './parser';

const FEED_URL_PATTERN = '/api/sns/web/v1/feed';

// Save original fetch, XHR, and toString for stealth
const originalFetch = window.fetch;
const originalXHR = window.XMLHttpRequest;
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
        platform: 'xiaohongshu',
        items,
      },
    },
    '*',
  );
}

/**
 * Patched fetch that intercepts XHS feed API responses.
 * Clones the response so the original page functionality is unaffected.
 */
const patchedFetch: typeof window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await originalFetch.call(window, input, init);

  try {
    // Check if this is a feed request
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url.includes(FEED_URL_PATTERN)) {
      // In Xiaohongshu Web, /api/sns/web/v1/feed is uniquely the Follow feed.
      // The Discover (algorithmic) feed uses /api/sns/web/v1/homefeed, which does not match FEED_URL_PATTERN.
      // Therefore, matching FEED_URL_PATTERN exactly is sufficient.
      // We removed the window.location.href.includes('follow') check because XHS web
      // doesn't typically put 'follow' in the URL or API path for this endpoint.

      // Clone the response so we don't consume the body
      const cloned = response.clone();
      // Process asynchronously to not block the page
      cloned
        .json()
        .then((data: unknown) => {
          const items = parseXiaohongshuFeed(data);
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
 * Patched XMLHttpRequest that intercepts XHS feed API responses.
 */
class PatchedXMLHttpRequest extends originalXHR {
  constructor() {
    super();
    this.addEventListener('load', function () {
      try {
        if (this.responseURL.includes(FEED_URL_PATTERN)) {
          // In Xiaohongshu Web, /api/sns/web/v1/feed is uniquely the Follow feed.
          // The Discover (algorithmic) feed uses /api/sns/web/v1/homefeed, which does not match FEED_URL_PATTERN.
          // Therefore, matching FEED_URL_PATTERN exactly is sufficient.

          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            const items = parseXiaohongshuFeed(data);
            postToBridge(items);
          }
        }
      } catch {
        // Silently fail
      }
    });
  }
}
window.XMLHttpRequest = PatchedXMLHttpRequest;

/**
 * Stealth: patch Function.prototype.toString so our patched fetch
 * returns the same string as the original, avoiding detection.
 */
Function.prototype.toString = function (this: Function): string {
  if (this === patchedFetch) {
    return originalToString.call(originalFetch);
  }
  if (this === PatchedXMLHttpRequest) {
    return originalToString.call(originalXHR);
  }
  return originalToString.call(this);
};

/**
 * If opened by active crawler, scroll to trigger fetch
 */
window.addEventListener('load', () => {
  if (window.location.hash.includes('omniclip-crawl')) {
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, 2000);
      // Sometimes body scroll works better
      document.body.scrollTop += 2000;
      document.documentElement.scrollTop += 2000;

      // Also try to scroll the main container if it exists
      const mainContainer = document.querySelector('#app, .main-container, .feed-container');
      if (mainContainer) {
        mainContainer.scrollTop += 2000;
      }
    }, 1000);
    setTimeout(() => clearInterval(scrollInterval), 12000);
  }
});
