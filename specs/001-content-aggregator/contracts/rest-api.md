# REST API Contract: Multi-Platform Content Aggregator

**Feature**: 001-content-aggregator
**Date**: 2026-03-10
**Base URL**: `/api/v1`
**Auth**: Bearer JWT token in `Authorization` header

---

## Authentication

### POST /auth/register
Create a new user account.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "display_name": "User Name"
}
```

**Response** (201):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User Name"
  },
  "access_token": "jwt-token",
  "refresh_token": "refresh-token"
}
```

**Errors**: 409 (email exists), 422 (validation)

### POST /auth/login
Authenticate and receive tokens.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response** (200):
```json
{
  "user": { "id": "uuid", "email": "...", "display_name": "..." },
  "access_token": "jwt-token",
  "refresh_token": "refresh-token"
}
```

**Errors**: 401 (invalid credentials)

### POST /auth/refresh
Refresh an expired access token.

**Request**:
```json
{
  "refresh_token": "refresh-token"
}
```

**Response** (200):
```json
{
  "access_token": "new-jwt-token",
  "refresh_token": "new-refresh-token"
}
```

---

## Platform Connections

### GET /connections
List all platform connections for the current user.

**Response** (200):
```json
{
  "connections": [
    {
      "id": "uuid",
      "platform": "github",
      "connection_type": "api",
      "status": "active",
      "sync_interval_minutes": 60,
      "last_sync_at": "2026-03-10T08:00:00Z",
      "last_error": null,
      "created_at": "2026-03-09T10:00:00Z"
    }
  ]
}
```

### POST /connections
Create a new platform connection.

**Request (API-based — GitHub)**:
```json
{
  "platform": "github",
  "connection_type": "api",
  "auth_data": {
    "personal_access_token": "ghp_xxxxxxxxxxxx"
  },
  "sync_interval_minutes": 60
}
```

**Request (Extension-based — Xiaohongshu)**:
```json
{
  "platform": "xiaohongshu",
  "connection_type": "extension",
  "sync_interval_minutes": 120
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "platform": "xiaohongshu",
  "connection_type": "extension",
  "status": "active",
  "sync_interval_minutes": 120
}
```

**Errors**: 409 (platform already connected), 422 (validation)

### PATCH /connections/:id
Update connection settings.

**Request**:
```json
{
  "sync_interval_minutes": 120,
  "auth_data": { "personal_access_token": "ghp_new_token" }
}
```

**Response** (200): Updated connection object

### DELETE /connections/:id
Disconnect a platform. Deletes stored credentials, stops future syncs.

**Response** (204): No content

### POST /connections/:id/test
Test connection health (verify API token / extension status).

**Response** (200):
```json
{
  "status": "healthy",
  "message": "GitHub API accessible, 4,850 requests remaining"
}
```

**Errors**: 503 (connection unhealthy)

---

## Content Feed

### GET /content
List content items with pagination and filters.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page (max 100) |
| platform | string | all | Filter by platform |
| content_type | string | all | Filter by type |
| from | ISO 8601 | - | Start date filter |
| to | ISO 8601 | - | End date filter |
| search | string | - | Full-text search in title/body |

**Response** (200):
```json
{
  "items": [
    {
      "id": "uuid",
      "platform": "github",
      "content_type": "release",
      "title": "v1.2.0 Release",
      "body": "Added new features...",
      "author_name": "octocat",
      "author_url": "https://github.com/octocat",
      "original_url": "https://github.com/repo/releases/v1.2.0",
      "media_urls": [],
      "metadata": { "tag_name": "v1.2.0", "stars": 1234 },
      "published_at": "2026-03-10T06:00:00Z",
      "collected_at": "2026-03-10T06:05:00Z",
      "ai_summary": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### GET /content/:id
Get a single content item with full details.

**Response** (200): Single content item object

---

## Digests

### GET /digests
List generated digests.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 10 | Items per page |
| type | string | all | 'daily' or 'weekly' |

**Response** (200):
```json
{
  "digests": [
    {
      "id": "uuid",
      "digest_type": "daily",
      "period_start": "2026-03-09T00:00:00Z",
      "period_end": "2026-03-10T00:00:00Z",
      "language": "zh",
      "item_count": 25,
      "status": "completed",
      "generated_at": "2026-03-10T08:05:00Z",
      "topic_groups": [
        {
          "topic": "AI Coding Tools",
          "summary": "...",
          "item_ids": ["uuid-1", "uuid-2"],
          "platforms": ["github", "youtube"]
        }
      ],
      "trend_analysis": "Cross-platform trend: 3 sources discussed..."
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 30, "total_pages": 3 }
}
```

### POST /digests/generate
Manually trigger digest generation.

**Request**:
```json
{
  "digest_type": "daily",
  "period_start": "2026-03-09T00:00:00Z",
  "period_end": "2026-03-10T00:00:00Z"
}
```

**Response** (202):
```json
{
  "id": "uuid",
  "status": "pending",
  "message": "Digest generation queued"
}
```

### GET /digests/:id
Get a single digest with full content.

**Response** (200): Full digest object

### GET /digests/:id/stream
Stream digest generation in real-time (Server-Sent Events).

**Response**: `text/event-stream`
```
event: progress
data: {"stage": "summarizing", "progress": 0.3, "current_item": "uuid-5"}

event: topic
data: {"topic": "AI Coding Tools", "summary": "..."}

event: complete
data: {"digest_id": "uuid", "status": "completed"}
```

---

## User Settings

### GET /users/me
Get current user profile and settings.

### PATCH /users/me
Update user settings.

**Request**:
```json
{
  "display_name": "New Name",
  "preferred_language": "en",
  "digest_frequency": "weekly",
  "digest_time": "09:00",
  "timezone": "America/New_York",
  "content_retention_days": 180
}
```

---

## Sync Jobs (Admin/Debug)

### GET /sync/jobs
List recent sync jobs for the current user.

**Query Parameters**: `connection_id`, `status`, `page`, `limit`

**Response** (200):
```json
{
  "jobs": [
    {
      "id": "uuid",
      "connection_id": "uuid",
      "platform": "github",
      "status": "completed",
      "items_collected": 12,
      "started_at": "2026-03-10T08:00:00Z",
      "completed_at": "2026-03-10T08:00:05Z"
    }
  ]
}
```

---

## Common Error Format

All errors follow this format:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "must be a valid email address" }
  ]
}
```

| Status | Usage |
|--------|-------|
| 400 | Bad request (malformed JSON) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (RLS violation) |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Service unavailable |
