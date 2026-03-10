# Data Model: Multi-Platform Content Aggregator

**Feature**: 001-content-aggregator
**Date**: 2026-03-10
**ORM**: Drizzle ORM (PostgreSQL 16)

---

## Entity Relationship Overview

```
User 1──N PlatformConnection
User 1──N ContentItem
User 1──N Digest
Digest N──N ContentItem (via digest_items join table)
PlatformConnection 1──N SyncJob
ContentItem N──1 PlatformConnection
```

---

## Tables

### 1. users

Primary user account table.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | User unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| display_name | VARCHAR(100) | NOT NULL | User display name |
| preferred_language | VARCHAR(10) | NOT NULL, DEFAULT 'zh' | Digest language preference (zh/en) |
| digest_frequency | VARCHAR(10) | NOT NULL, DEFAULT 'daily' | 'daily' or 'weekly' |
| digest_time | TIME | NOT NULL, DEFAULT '08:00' | Preferred digest delivery time |
| timezone | VARCHAR(50) | NOT NULL, DEFAULT 'Asia/Shanghai' | User timezone for scheduling |
| content_retention_days | INTEGER | NOT NULL, DEFAULT 90 | Content auto-cleanup threshold |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Account creation time |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last profile update |

**RLS Policy**: `user_id = current_setting('app.current_user_id')::uuid`

**Indexes**:
- `idx_users_email` UNIQUE on `email`

---

### 2. platform_connections

Links a user to a content platform with auth state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Connection unique identifier |
| user_id | UUID | FK → users.id, NOT NULL | Owning user |
| platform | VARCHAR(30) | NOT NULL | Platform identifier: 'github', 'youtube', 'twitter', 'xiaohongshu' |
| connection_type | VARCHAR(20) | NOT NULL | 'api' or 'extension' |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 'active', 'error', 'disconnected' |
| auth_data | JSONB | NULL | Encrypted API tokens / OAuth data (NULL for extension-based) |
| sync_interval_minutes | INTEGER | NOT NULL, DEFAULT 60 | Sync frequency in minutes |
| last_sync_at | TIMESTAMPTZ | NULL | Last successful sync timestamp |
| last_error | TEXT | NULL | Last error message (actionable) |
| error_count | INTEGER | NOT NULL, DEFAULT 0 | Consecutive error count (for backoff) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Connection creation time |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update |

**RLS Policy**: `user_id = current_setting('app.current_user_id')::uuid`

**Indexes**:
- `idx_pc_user_platform` UNIQUE on `(user_id, platform)` — one connection per platform per user
- `idx_pc_status` on `(status)` — filter active connections for sync scheduling

**State transitions**:
```
disconnected → active    (user connects platform)
active → error           (sync failure, auth expiry)
error → active           (user re-authenticates, error auto-resolves)
active → disconnected    (user disconnects platform)
error → disconnected     (user disconnects platform)
```

---

### 3. content_items

Individual pieces of collected content across all platforms.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Content item unique identifier |
| user_id | UUID | FK → users.id, NOT NULL | Owning user |
| connection_id | UUID | FK → platform_connections.id, NOT NULL | Source connection |
| platform | VARCHAR(30) | NOT NULL | Denormalized from connection for query perf |
| external_id | VARCHAR(255) | NOT NULL | Platform-native unique identifier |
| content_type | VARCHAR(30) | NOT NULL | 'post', 'video', 'commit', 'release', 'issue', 'tweet' |
| title | TEXT | NULL | Title (if applicable) |
| body | TEXT | NULL | Main text content |
| media_urls | JSONB | NULL, DEFAULT '[]' | Array of media URLs (images, video thumbnails) |
| metadata | JSONB | NULL, DEFAULT '{}' | Platform-specific metadata (engagement metrics, tags, etc.) |
| author_name | VARCHAR(255) | NULL | Original content author |
| author_url | VARCHAR(500) | NULL | Author profile URL |
| original_url | VARCHAR(500) | NOT NULL | Direct link to original content |
| published_at | TIMESTAMPTZ | NOT NULL | Original publish time on platform |
| collected_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | When we collected this item |
| ai_summary | TEXT | NULL | AI-generated per-item summary (populated during digest) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

**RLS Policy**: `user_id = current_setting('app.current_user_id')::uuid`

**Indexes**:
- `idx_ci_dedup` UNIQUE on `(user_id, platform, external_id)` — deduplication constraint (FR-007)
- `idx_ci_feed` on `(user_id, published_at DESC)` — feed query (chronological sort)
- `idx_ci_platform_date` on `(user_id, platform, published_at DESC)` — platform-filtered feed
- `idx_ci_content_type` on `(user_id, content_type)` — type-filtered queries
- GIN index on `metadata` for JSONB queries

**Upsert strategy** (deduplication):
```sql
INSERT INTO content_items (...)
VALUES (...)
ON CONFLICT (user_id, platform, external_id)
DO UPDATE SET
  body = EXCLUDED.body,
  metadata = EXCLUDED.metadata,
  media_urls = EXCLUDED.media_urls,
  collected_at = EXCLUDED.collected_at;
```

---

### 4. digests

AI-generated content summaries for a time period.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Digest unique identifier |
| user_id | UUID | FK → users.id, NOT NULL | Owning user |
| digest_type | VARCHAR(10) | NOT NULL | 'daily' or 'weekly' |
| period_start | TIMESTAMPTZ | NOT NULL | Coverage period start |
| period_end | TIMESTAMPTZ | NOT NULL | Coverage period end |
| language | VARCHAR(10) | NOT NULL | Summary language |
| topic_groups | JSONB | NOT NULL | Array of { topic, summary, item_ids[] } |
| trend_analysis | TEXT | NULL | Cross-platform trend highlights |
| item_count | INTEGER | NOT NULL | Number of items covered |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 'pending', 'generating', 'completed', 'failed' |
| generated_at | TIMESTAMPTZ | NULL | Completion timestamp |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

**RLS Policy**: `user_id = current_setting('app.current_user_id')::uuid`

**Indexes**:
- `idx_digest_user_period` on `(user_id, period_end DESC)` — latest digest query
- `idx_digest_status` on `(status)` — pending digest processing

**State transitions**:
```
pending → generating     (digest job starts processing)
generating → completed   (AI generation succeeds)
generating → failed      (AI generation fails)
failed → pending         (retry triggered)
```

---

### 5. digest_items (join table)

Links digests to the content items they cover.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| digest_id | UUID | FK → digests.id, NOT NULL | Parent digest |
| content_item_id | UUID | FK → content_items.id, NOT NULL | Covered content item |

**Primary Key**: `(digest_id, content_item_id)`

---

### 6. sync_jobs (managed by BullMQ, optional audit table)

Optional audit trail for sync job execution. BullMQ manages the actual job queue in Redis; this table provides persistent history for debugging.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Job record identifier |
| user_id | UUID | FK → users.id, NOT NULL | Owning user |
| connection_id | UUID | FK → platform_connections.id, NOT NULL | Target connection |
| platform | VARCHAR(30) | NOT NULL | Platform identifier |
| status | VARCHAR(20) | NOT NULL | 'queued', 'running', 'completed', 'failed' |
| items_collected | INTEGER | NULL | Number of items collected |
| error_message | TEXT | NULL | Error details if failed |
| started_at | TIMESTAMPTZ | NULL | Job start time |
| completed_at | TIMESTAMPTZ | NULL | Job completion time |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |

**RLS Policy**: `user_id = current_setting('app.current_user_id')::uuid`

**Indexes**:
- `idx_sj_connection` on `(connection_id, created_at DESC)` — job history per connection

---

## JSONB Schema Examples

### content_items.metadata

**GitHub (release)**:
```json
{
  "tag_name": "v1.2.0",
  "prerelease": false,
  "stars": 1234,
  "language": "TypeScript"
}
```

**YouTube (video)**:
```json
{
  "channel_id": "UC...",
  "duration_seconds": 600,
  "view_count": 50000,
  "like_count": 2000,
  "thumbnail_url": "https://..."
}
```

**X/Twitter (tweet)**:
```json
{
  "retweet_count": 100,
  "like_count": 500,
  "reply_count": 20,
  "is_retweet": false,
  "hashtags": ["typescript", "webdev"]
}
```

**Xiaohongshu (post)**:
```json
{
  "likes": 1000,
  "collects": 200,
  "comments": 50,
  "tags": ["tech", "coding"],
  "note_type": "normal"
}
```

### digests.topic_groups

```json
[
  {
    "topic": "AI Coding Tools",
    "summary": "3 sources across GitHub and YouTube discussed new AI-powered development tools...",
    "item_ids": ["uuid-1", "uuid-2", "uuid-3"],
    "platforms": ["github", "youtube"]
  },
  {
    "topic": "TypeScript Updates",
    "summary": "TypeScript 5.8 release with new decorator metadata...",
    "item_ids": ["uuid-4", "uuid-5"],
    "platforms": ["github", "twitter"]
  }
]
```

---

## Row-Level Security (RLS) Setup

```sql
-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies (example for content_items)
CREATE POLICY content_items_isolation ON content_items
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- Application sets the session variable per request
-- Drizzle ORM: db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`)
```

---

## Migration Strategy

- Use Drizzle Kit (`drizzle-kit generate` → `drizzle-kit migrate`) for schema migrations
- Migrations are version-controlled in `packages/backend/drizzle/` directory
- Each migration is a sequential SQL file with up/down operations
- RLS policies are included in initial migration, not applied separately
