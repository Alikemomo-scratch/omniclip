# Extension ↔ Backend Sync Protocol (DEPRECATED)

> ⚠️ **DEPRECATED (v3)**: The browser extension sync endpoint is deprecated as of v3.
> All platforms now use server-side API sync. This document is retained for reference only.
> The extension sync endpoint (`POST /api/v1/sync/extension`) remains functional but
> new connections should use `connection_type: 'api'`.

**Feature**: 001-content-aggregator
**Date**: 2026-03-10
**Transport**: HTTPS POST
**Auth**: Bearer JWT (aggregator user token, NOT platform credentials)

---

## Overview

The Chrome extension collects content from anti-scraping platforms (X/Twitter, Xiaohongshu) by intercepting API responses in the user's authenticated browser session. Collected items are buffered locally in `chrome.storage.local` and periodically synced to the backend via this protocol.

**Security invariants** (FR-017 ~ FR-022):

- Sync payloads contain ONLY content data + aggregator auth token
- NO platform cookies, session tokens, or passwords are transmitted
- All communication over HTTPS
- Extension operates in read-only passive mode

---

## Sync Endpoint

### POST /api/v1/sync/extension

Batch upload content items collected by the extension.

**Headers**:

```
Authorization: Bearer <aggregator-jwt-token>
Content-Type: application/json
X-Extension-Version: 1.0.0
X-Platform: xiaohongshu
```

**Request**:

```json
{
  "platform": "xiaohongshu",
  "connection_id": "uuid-of-connection",
  "items": [
    {
      "external_id": "note-abc123",
      "content_type": "post",
      "title": "Post title",
      "body": "Post content text...",
      "media_urls": ["https://sns-webpic-qc.xhscdn.com/xxx.jpg"],
      "metadata": {
        "likes": 1000,
        "collects": 200,
        "comments": 50,
        "tags": ["tech"]
      },
      "author_name": "Creator Name",
      "author_url": "https://www.xiaohongshu.com/user/profile/xxx",
      "original_url": "https://www.xiaohongshu.com/explore/xxx",
      "published_at": "2026-03-10T06:00:00Z"
    }
  ],
  "sync_metadata": {
    "collected_at": "2026-03-10T08:00:00Z",
    "items_in_buffer": 5,
    "extension_version": "1.0.0"
  }
}
```

**Response** (200):

```json
{
  "accepted": 5,
  "duplicates_updated": 2,
  "errors": [],
  "next_sync_at": "2026-03-10T09:00:00Z"
}
```

**Response** (207 — Partial success):

```json
{
  "accepted": 3,
  "duplicates_updated": 1,
  "errors": [
    {
      "external_id": "note-xyz789",
      "error": "validation_failed",
      "message": "missing required field: original_url"
    }
  ]
}
```

**Errors**:

- 401: Invalid or expired aggregator token → extension prompts re-login to aggregator
- 404: Connection not found (user may have disconnected this platform)
- 429: Rate limited — extension should respect `Retry-After` header

---

## Health Check

### POST /api/v1/sync/heartbeat

Extension periodically reports its health status.

**Request**:

```json
{
  "connection_id": "uuid",
  "platform": "xiaohongshu",
  "status": "active",
  "last_collection_at": "2026-03-10T07:55:00Z",
  "items_buffered": 3,
  "errors": []
}
```

**Error report** (platform login expired):

```json
{
  "connection_id": "uuid",
  "platform": "xiaohongshu",
  "status": "error",
  "error_type": "auth_expired",
  "error_message": "Platform login session expired. User needs to re-login to Xiaohongshu.",
  "last_collection_at": "2026-03-10T06:00:00Z"
}
```

**Response** (200):

```json
{
  "ack": true,
  "sync_interval_minutes": 60,
  "connection_status": "active"
}
```

---

## Extension Internal Message Protocol

### Content Script → Bridge (window.postMessage)

```javascript
// MAIN world content script posts intercepted data
window.postMessage(
  {
    type: 'AGGREGATOR_CONTENT',
    source: 'aggregator-main',
    payload: {
      platform: 'xiaohongshu',
      items: [
        /* parsed content items */
      ],
    },
  },
  '*',
);
```

### Bridge → Service Worker (chrome.runtime.sendMessage)

```javascript
// ISOLATED world bridge relays to service worker
chrome.runtime.sendMessage({
  type: 'CONTENT_COLLECTED',
  platform: 'xiaohongshu',
  items: [
    /* content items */
  ],
  timestamp: Date.now(),
});
```

### Service Worker Internal State (chrome.storage.local)

```javascript
// Buffer structure in chrome.storage.local
{
  "sync_buffer": {
    "xiaohongshu": {
      "items": [/* buffered items awaiting sync */],
      "last_sync": 1710050400000,
      "error_count": 0
    },
    "twitter": {
      "items": [],
      "last_sync": 1710050400000,
      "error_count": 0
    }
  },
  "user_token": "jwt-token-for-aggregator",
  "connections": {
    "xiaohongshu": { "id": "uuid", "interval": 60 },
    "twitter": { "id": "uuid", "interval": 30 }
  }
}
```

---

## Sync Flow Sequence

```
1. User browses Xiaohongshu feed (naturally)
2. MAIN world content script intercepts fetch response
3. Content script parses response → extracts content items
4. Content script posts data to Bridge via window.postMessage
5. Bridge forwards to Service Worker via chrome.runtime.sendMessage
6. Service Worker buffers items in chrome.storage.local
7. chrome.alarms fires at configured interval
8. Service Worker reads buffer, POSTs to /api/v1/sync/extension
9. Backend upserts items (ON CONFLICT dedup), returns result
10. Service Worker clears synced items from buffer
11. On failure: increment error_count, apply exponential backoff
```

---

## Rate Limiting & Backoff

- Extension respects `sync_interval_minutes` from connection settings
- On sync failure: wait `min(2^error_count * 60, 3600)` seconds before retry
- After 5 consecutive failures: mark connection as "error" via heartbeat, stop retrying
- On 429 response: respect `Retry-After` header exactly
