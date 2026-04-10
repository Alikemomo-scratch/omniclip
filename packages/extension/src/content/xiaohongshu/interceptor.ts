/**
 * Enhanced Xiaohongshu content script with comprehensive debugging
 */

import { parseXiaohongshuFeed } from './parser';

// Debug mode - set to true to see detailed logs
const DEBUG = true;

const FEED_URL_PATTERNS = [
  'api/sns/web',
  'api/sns/v5/feed',
  'api/sns/v6/feed',
  'v5/feed',
  'v6/feed',
];

const originalFetch = window.fetch;
const originalXHR = window.XMLHttpRequest;
const originalToString = Function.prototype.toString;

let hasInterceptedApiData = false;
let interceptedCount = 0;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[OmniClip XHS]', ...args);
  }
}

function showToast(message: string, isError = false) {
  // Guard: ensure document.body exists
  if (!document.body) {
    console.log('[OmniClip XHS Toast]', message);
    return;
  }

  // Create toast element - no removal, just fade out with CSS
  const toast = document.createElement('div');
  toast.textContent = message;
  // Use CSS animation only, no setTimeout removal
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${isError ? '#ff4d4f' : '#00b96b'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    z-index: 2147483647;
    font-family: sans-serif;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    opacity: 1;
    transition: opacity 0.5s ease-in 5s;
  `;

  document.body.appendChild(toast);

  // Use a simple delayed opacity change - no removal
  const fadeOut = function () {
    toast.style.opacity = '0';
  };

  // Call via setTimeout with function reference
  window.setTimeout(fadeOut, 5000);
}

function postToBridge(items: unknown[]): void {
  if (items.length === 0) return;

  log('Posting to bridge:', items.length, 'items');

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

function isFeedRequest(url: string): boolean {
  // More permissive matching
  const isMatch =
    FEED_URL_PATTERNS.some((pattern) => url.includes(pattern)) &&
    url.includes('feed') &&
    !url.includes('homefeed') &&
    !url.includes('search');

  if (DEBUG && isMatch) {
    log('Matched feed URL:', url);
  }

  return isMatch;
}

const patchedFetch: typeof window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await originalFetch.call(window, input, init);

  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (isFeedRequest(url)) {
      log('Intercepting fetch:', url);

      const cloned = response.clone();
      cloned
        .json()
        .then((data: unknown) => {
          log('Response data structure:', Object.keys(data || {}));

          const items = parseXiaohongshuFeed(data);
          log(`Parsed ${items.length} items from feed.`);

          if (items.length > 0) {
            hasInterceptedApiData = true;
            interceptedCount += items.length;
            showToast(
              `OmniClip: Synced ${items.length} Xiaohongshu items! (Total: ${interceptedCount})`,
            );
            postToBridge(items);
          } else {
            log('No items parsed from response:', data);
            showToast('OmniClip: Fetched XHS feed, but found 0 valid items.', true);
          }
        })
        .catch((err) => {
          console.error('[OmniClip XHS] Failed to parse feed:', err);
        });
    }
  } catch (err) {
    log('Fetch interception error:', err);
  }

  return response;
};

window.fetch = patchedFetch;

class PatchedXMLHttpRequest extends originalXHR {
  constructor() {
    super();
    this.addEventListener('load', function () {
      try {
        if (isFeedRequest(this.responseURL)) {
          log('Intercepting XHR:', this.responseURL);

          let data: unknown = null;
          if (this.responseType === 'json') {
            data = this.response;
          } else if (this.responseText) {
            data = JSON.parse(this.responseText);
          }

          if (data) {
            log('XHR response data structure:', Object.keys(data || {}));

            const items = parseXiaohongshuFeed(data);
            log(`XHR parsed ${items.length} items from feed.`);

            if (items.length > 0) {
              hasInterceptedApiData = true;
              interceptedCount += items.length;
              showToast(
                `OmniClip: Synced ${items.length} Xiaohongshu items! (Total: ${interceptedCount})`,
              );
              postToBridge(items);
            }
          }
        }
      } catch (err) {
        log('XHR interception error:', err);
      }
    });
  }
}
window.XMLHttpRequest = PatchedXMLHttpRequest;

Function.prototype.toString = function (this: Function): string {
  if (this === patchedFetch) {
    return originalToString.call(originalFetch);
  }
  if (this === PatchedXMLHttpRequest) {
    return originalToString.call(originalXHR);
  }
  return originalToString.call(this);
};

function scrapeDomForItems(): void {
  if (hasInterceptedApiData) return;

  try {
    // Expanded selectors for different XHS versions
    const selectors = [
      'section.note-item',
      '.note-item',
      'a.cover',
      '.explore-feed-container > section',
      '[data-v-] a[href*="/explore/"]',
      '.feeds-page .note-item',
      '.main-container .note-item',
      '[class*="note"] a[href*="/explore/"]',
    ];

    const noteElements = Array.from(document.querySelectorAll(selectors.join(', ')));

    log('DOM scraper found', noteElements.length, 'elements');

    if (!noteElements || noteElements.length === 0) return;

    const items: any[] = [];
    const uniqueUrls = new Set<string>();

    noteElements.forEach((el) => {
      const links = el.querySelectorAll('a[href*="/explore/"]');
      const authorLinks = el.querySelectorAll('a[href*="/user/profile/"]');

      links.forEach((link) => {
        const anchor = link as HTMLAnchorElement;
        const url = anchor.href;

        if (!url || !url.includes('/explore/')) return;
        if (uniqueUrls.has(url)) return;
        uniqueUrls.add(url);

        const title =
          anchor.textContent?.trim() ||
          el.querySelector('span.title, .title, h3, h4')?.textContent?.trim() ||
          'Untitled';

        const idMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/);
        const id = idMatch ? idMatch[1] : `dom-${Date.now()}-${Math.random()}`;

        const authorLink = authorLinks[0] as HTMLAnchorElement;
        const authorName =
          authorLink?.textContent?.trim() ||
          el.querySelector('[class*="author"], [class*="nickname"]')?.textContent?.trim() ||
          'Unknown User';

        items.push({
          external_id: id,
          content_type: 'post',
          title: title.slice(0, 100),
          body: null,
          media_urls: [],
          metadata: {
            tags: [],
            scraped: true,
            scrapeTime: new Date().toISOString(),
          },
          author_name: authorName,
          author_url: authorLink?.href || null,
          original_url: url,
          published_at: new Date().toISOString(),
        });
      });
    });

    if (items.length > 0) {
      log(`DOM Scraper found ${items.length} items as fallback.`);
      showToast(`OmniClip: Scraped ${items.length} XHS items via DOM!`);
      postToBridge(items);
    }
  } catch (err) {
    console.error('[OmniClip XHS] DOM Scraper failed:', err);
  }
}

// Initial state parsing with better error handling
window.addEventListener('load', () => {
  log('Content script loaded, checking for __INITIAL_STATE__');

  try {
    const state = (window as any).__INITIAL_STATE__;
    log('__INITIAL_STATE__ found:', !!state);

    if (state) {
      log('State keys:', Object.keys(state));

      if (state.feed && state.feed.notes) {
        log('Found notes in state.feed.notes:', state.feed.notes.length);

        const fakeResponse = {
          code: 0,
          success: true,
          data: {
            items: state.feed.notes.map((note: any) => ({
              id: note.id || note.noteId,
              model_type: 'note',
              note_card: note,
            })),
          },
        };

        const items = parseXiaohongshuFeed(fakeResponse);
        log(`Parsed ${items.length} items from initial state.`);

        if (items.length > 0) {
          hasInterceptedApiData = true;
          interceptedCount += items.length;
          showToast(`OmniClip: Synced ${items.length} XHS items (Initial State)!`);
          postToBridge(items);
        }
      } else {
        log('No notes found in initial state');
        if (state.feed) {
          log('Available feed keys:', Object.keys(state.feed));
        }
      }
    }
  } catch (err) {
    console.error('[OmniClip XHS] Failed to parse __INITIAL_STATE__:', err);
  }

  // Always start DOM scraper as backup
  setInterval(() => {
    scrapeDomForItems();
  }, 5000);

  // Crawl mode
  if (window.location.hash.includes('omniclip-crawl')) {
    log('Starting crawl mode');

    const attemptClickFollow = setInterval(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const followTab = elements.find((el) => {
        if (el.children.length > 2) return false;
        const text = el.textContent?.trim() || '';
        return (text === '关注' || text === '关注频道') && !text.includes('已关注');
      });

      if (followTab) {
        log('Clicking Follow tab:', followTab);
        (followTab as HTMLElement).click();
        clearInterval(attemptClickFollow);
      }
    }, 1000);

    setTimeout(() => clearInterval(attemptClickFollow), 8000);

    const scrollInterval = setInterval(() => {
      window.scrollBy(0, 2000);
      document.body.scrollTop += 2000;
      document.documentElement.scrollTop += 2000;
    }, 1000);

    setTimeout(() => clearInterval(scrollInterval), 15000);
  }
});

// Expose debug info to window
(window as any).__OMNIXHS_DEBUG__ = {
  hasInterceptedApiData: () => hasInterceptedApiData,
  interceptedCount: () => interceptedCount,
  scrapeNow: scrapeDomForItems,
};

log('XHS Interceptor initialized');
