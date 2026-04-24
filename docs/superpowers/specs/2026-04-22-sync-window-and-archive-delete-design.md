# Sync Time Window Fix + Content/Digest Archive & Delete

Date: 2026-04-22

## Overview

Two changes:

1. **Sync time window**: Sync fetches content from `now - sync_interval` instead of `last_sync_at`.
2. **Archive & Delete**: Users can archive (hide + recoverable) or delete (permanent hard delete) individual content items and digests.

## Feature 1: Sync Time Window

### Current behavior

`SyncProcessor.process()` passes `connection.lastSyncAt` (or `null` on first sync) as the `since` parameter to `connector.fetchContent()`.

### New behavior

Compute `since = new Date(Date.now() - syncIntervalMinutes * 60 * 1000)` and pass that instead. This ensures each sync always covers exactly the configured time window, regardless of when the last sync actually ran.

### Change scope

Single file: `packages/backend/src/sync/sync.processor.ts` — replace `connection.lastSyncAt` with computed `since` in the `fetchContent()` call. ~3 lines changed.

`connData.last_sync_at` remains unchanged (historical record). Only the `since` argument to `fetchContent()` changes.

## Feature 2: Archive & Delete

### Semantics

| Action | Effect | Recoverable |
|--------|--------|-------------|
| Archive | Set `archived_at = now()`, hidden from default feed | Yes — unarchive sets `archived_at = null` |
| Delete | Hard DELETE from database | No |

### Database

Add `archived_at` nullable timestamp to both tables:

```sql
ALTER TABLE content_items ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE digests ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
```

Drizzle schema (`schema/index.ts`):
```typescript
archivedAt: timestamp('archived_at', { withTimezone: true }),
```

No RLS policy changes needed — existing `user_id` isolation covers archive/delete operations.

### Backend API

#### Content endpoints (content.controller.ts)

| Method | Path | Action |
|--------|------|--------|
| PATCH | `/content/:id/archive` | Set `archived_at = now()` |
| PATCH | `/content/:id/unarchive` | Set `archived_at = null` |
| DELETE | `/content/:id` | Hard delete row |

#### Digest endpoints (digest.controller.ts)

| Method | Path | Action |
|--------|------|--------|
| PATCH | `/digests/:id/archive` | Set `archived_at = now()` |
| PATCH | `/digests/:id/unarchive` | Set `archived_at = null` |
| DELETE | `/digests/:id` | Hard delete row + cascade to digest_items |

#### Query changes

`content.service.findAll()` and `digest.service.findAll()` accept a new `archived?: boolean` query parameter:
- Default (omitted or `false`): `WHERE archived_at IS NULL`
- `true`: `WHERE archived_at IS NOT NULL`

### Frontend

#### API client (api-client.ts)

Add to `contentApi`:
- `archive(id: string)` → PATCH `/content/:id/archive`
- `unarchive(id: string)` → PATCH `/content/:id/unarchive`
- `delete(id: string)` → DELETE `/content/:id`

Add to `digestsApi`:
- `archive(id: string)` → PATCH `/digests/:id/archive`
- `unarchive(id: string)` → PATCH `/digests/:id/unarchive`
- `delete(id: string)` → DELETE `/digests/:id`

#### Feed page (feed/page.tsx)

- Add tab bar: **全部** | **已归档**
- Active tab passes `archived=false` (default) or `archived=true` to `contentApi.list()`
- ContentCard: add archive icon button + delete icon button
- In archived tab: show unarchive button instead of archive button
- On action: call API → invalidate React Query cache `['content']`
- Delete: no confirmation dialog

#### Digests page (digests/page.tsx)

- Add tab bar: **全部** | **已归档**
- Same pattern as Feed: archived query param, archive/unarchive/delete buttons on DigestCard
- On action: call API → invalidate `['digests']`

### Retention job interaction

Existing `retention.processor.ts` hard-deletes old content by `collected_at`. Archived items are subject to the same retention policy — archiving does not exempt from retention cleanup.

### Error handling

- Archive/unarchive/delete of non-existent item: return 404
- Archive/delete of another user's item: RLS blocks, return 404 (not 403, to avoid leaking existence)
- All operations use `withRlsContext` for user scoping

## Files to modify

### Feature 1 (sync window)
- `packages/backend/src/sync/sync.processor.ts`

### Feature 2 (archive & delete)
- `packages/backend/src/common/database/schema/index.ts` — add `archivedAt` column to both tables
- `packages/backend/drizzle/0002_add_archived_at.sql` — new migration
- `packages/backend/src/content/content.controller.ts` — add PATCH/DELETE endpoints
- `packages/backend/src/content/content.service.ts` — add archive/unarchive/remove methods, update findAll
- `packages/backend/src/digest/digest.controller.ts` — add PATCH/DELETE endpoints
- `packages/backend/src/digest/digest.service.ts` — add archive/unarchive/remove methods, update findAll
- `packages/frontend/src/lib/api-client.ts` — add client methods
- `packages/frontend/src/app/(dashboard)/feed/page.tsx` — tabs + action buttons
- `packages/frontend/src/app/(dashboard)/digests/page.tsx` — tabs + action buttons
