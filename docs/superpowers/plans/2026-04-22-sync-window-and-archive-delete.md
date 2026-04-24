# Sync Time Window Fix + Content/Digest Archive & Delete — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sync to fetch content based on `now - sync_interval` instead of `lastSyncAt`, and add archive (soft-hide with recovery) + delete (hard permanent removal) for content items and digests.

**Architecture:** Two independent features. Feature 1 changes one line in the sync processor. Feature 2 adds `archived_at` nullable timestamp column to `content_items` and `digests`, new PATCH/DELETE endpoints on both controllers, and frontend tab switching + action buttons on Feed and Digests pages. All mutations use existing `withRlsContext` pattern for user scoping.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, React (Next.js), TanStack Query, class-validator

**Spec:** `docs/superpowers/specs/2026-04-22-sync-window-and-archive-delete-design.md`

---

## Chunk 1: Backend — Sync Window + Schema + Content Archive/Delete

### Task 1: Sync Time Window Fix

**Files:**
- Modify: `packages/backend/src/sync/sync.processor.ts:62-64`

- [ ] **Step 1: Modify sync.processor.ts to compute since from interval**

Replace line 64:
```typescript
// OLD (line 64):
const fetchResult = await connector.fetchContent(connData, connection.lastSyncAt);
```

With:
```typescript
// NEW:
const intervalMs = (connection.syncIntervalMinutes ?? 60) * 60 * 1000;
const since = new Date(Date.now() - intervalMs);
const fetchResult = await connector.fetchContent(connData, since);
```

This is the ONLY change. `connData.last_sync_at` stays for historical reference; only the `since` argument to `fetchContent()` changes. All sync paths (scheduled + manual via POST `/connections/:id/sync`) go through `SyncProcessor.process()`, so this single change covers everything.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

- [ ] **Step 3: Run existing tests**

Run: `pnpm test`
Expected: All existing tests pass (no regressions).

---

### Task 2: Database Schema + Migration

**Files:**
- Modify: `packages/backend/src/common/database/schema/index.ts:66-97` (contentItems) and `:102-124` (digests)
- Create: `packages/backend/drizzle/0002_add_archived_at.sql`

- [ ] **Step 1: Add `archivedAt` column to `contentItems` in schema**

In `packages/backend/src/common/database/schema/index.ts`, inside the `contentItems` table definition, add `archivedAt` AFTER `aiSummary` (line 88) and BEFORE `createdAt` (line 89):

```typescript
    aiSummary: text('ai_summary'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 2: Add `archivedAt` column to `digests` in schema**

In the same file, inside the `digests` table definition, add `archivedAt` AFTER `generatedAt` (line 117) and BEFORE `createdAt` (line 118):

```typescript
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 3: Create SQL migration file**

Create `packages/backend/drizzle/0002_add_archived_at.sql`:

```sql
-- Add archived_at column to content_items and digests
ALTER TABLE content_items ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE digests ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
```

No RLS policy changes needed — existing `user_id`-based policies cover these new columns automatically.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

---

### Task 3: Content Backend — DTO, Service, Controller

**Files:**
- Modify: `packages/backend/src/content/dto/content-query.dto.ts`
- Modify: `packages/backend/src/content/content.service.ts`
- Modify: `packages/backend/src/content/content.controller.ts`

- [ ] **Step 1: Add `archived` field to ContentQueryDto**

In `packages/backend/src/content/dto/content-query.dto.ts`, add at the end of the class (before the closing `}`):

```typescript
import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';

export class ContentQueryDto {
  // ... existing fields ...

  @IsOptional()
  @IsBooleanString()
  archived?: string;
}
```

The full import line replaces the existing one (adds `IsBooleanString`). The `archived` field is at the bottom.

- [ ] **Step 2: Add archive/unarchive/remove methods + modify findAll and buildWhereConditions in ContentService**

In `packages/backend/src/content/content.service.ts`:

**2a.** Update the import from `drizzle-orm` to add `isNull` and `isNotNull`:
```typescript
import { eq, and, gte, lte, or, ilike, sql, count, isNull, isNotNull } from 'drizzle-orm';
```

**2b.** Add `archived_at` to the select columns in `findAll` data query (after `ai_summary`):
```typescript
          ai_summary: contentItems.aiSummary,
          archived_at: contentItems.archivedAt,
```

Also add `archived_at` to `findById` select columns (after `ai_summary`):
```typescript
          ai_summary: contentItems.aiSummary,
          archived_at: contentItems.archivedAt,
```

**2c.** Add archive filter to `buildWhereConditions` method — add at the end before `return conditions;`:
```typescript
    // Default: exclude archived items. If archived=true, show only archived.
    if (query.archived === 'true') {
      conditions.push(isNotNull(contentItems.archivedAt));
    } else {
      conditions.push(isNull(contentItems.archivedAt));
    }
```

**2d.** Add three new methods to the `ContentService` class (after `buildWhereConditions`):

```typescript
  /**
   * Archive a content item (set archived_at = now).
   */
  async archive(userId: string, itemId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(eq(contentItems.id, itemId));

      if (!existing) {
        throw new NotFoundException('Content item not found');
      }

      await tx
        .update(contentItems)
        .set({ archivedAt: new Date() })
        .where(eq(contentItems.id, itemId));
    });
  }

  /**
   * Unarchive a content item (set archived_at = null).
   */
  async unarchive(userId: string, itemId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(eq(contentItems.id, itemId));

      if (!existing) {
        throw new NotFoundException('Content item not found');
      }

      await tx
        .update(contentItems)
        .set({ archivedAt: null })
        .where(eq(contentItems.id, itemId));
    });
  }

  /**
   * Permanently delete a content item.
   */
  async remove(userId: string, itemId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(eq(contentItems.id, itemId));

      if (!existing) {
        throw new NotFoundException('Content item not found');
      }

      await tx.delete(contentItems).where(eq(contentItems.id, itemId));
    });
  }
```

- [ ] **Step 3: Add PATCH/DELETE endpoints to ContentController**

Replace the entire `packages/backend/src/content/content.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentService } from './content.service';
import { ContentQueryDto } from './dto';

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  /**
   * GET /content — List content items with pagination and filters.
   */
  @Get()
  async findAll(@Request() req: { user: { userId: string } }, @Query() query: ContentQueryDto) {
    return this.contentService.findAll(req.user.userId, query);
  }

  /**
   * GET /content/:id — Get a single content item.
   */
  @Get(':id')
  async findById(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contentService.findById(req.user.userId, id);
  }

  /**
   * PATCH /content/:id/archive — Archive a content item.
   */
  @Patch(':id/archive')
  @HttpCode(204)
  async archive(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.archive(req.user.userId, id);
  }

  /**
   * PATCH /content/:id/unarchive — Restore an archived content item.
   */
  @Patch(':id/unarchive')
  @HttpCode(204)
  async unarchive(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.unarchive(req.user.userId, id);
  }

  /**
   * DELETE /content/:id — Permanently delete a content item.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.remove(req.user.userId, id);
  }
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

- [ ] **Step 5: Run existing tests and fix if needed**

Run: `pnpm test`
Expected: Existing content tests still pass. The `findAll` tests mock `.where()` which may need an extra call now that we always add the `isNull(archivedAt)` condition. If tests fail because of the new where condition, the mock setup in `content.service.spec.ts` `setupFindAllMocks` might need adjusting (the `.where()` call count stays the same since `buildWhereConditions` was already called, it just has more conditions in the AND clause).

---

### Task 4: Digest Backend — DTO, Service, Controller

**Files:**
- Modify: `packages/backend/src/digest/dto/index.ts`
- Modify: `packages/backend/src/digest/digest.service.ts`
- Modify: `packages/backend/src/digest/digest.controller.ts`

- [ ] **Step 1: Add `archived` field to DigestQueryDto**

In `packages/backend/src/digest/dto/index.ts`, update the imports and add to `DigestQueryDto`:

```typescript
import { IsString, IsOptional, IsIn, IsDateString, IsInt, Min, Max, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';

// GenerateDigestDto stays unchanged...

export class DigestQueryDto {
  // ... existing fields ...

  @IsOptional()
  @IsBooleanString()
  archived?: string;
}
```

- [ ] **Step 2: Update DigestService — modify findAll + add archive/unarchive/remove**

In `packages/backend/src/digest/digest.service.ts`:

**2a.** Update the import from `drizzle-orm` to add `isNull` and `isNotNull`:
```typescript
import { eq, and, gte, lte, sql, count, desc, isNull, isNotNull } from 'drizzle-orm';
```

**2b.** Update the `findAll` method signature to accept the `archived` field:
```typescript
  async findAll(userId: string, query: { page?: number; limit?: number; type?: string; archived?: string }) {
```

**2c.** Add archive filter condition inside `findAll`, after the existing `type` filter condition:
```typescript
      const conditions = [];
      if (query.type) {
        conditions.push(eq(digests.digestType, query.type));
      }

      // Archive filter: default excludes archived, archived=true shows only archived
      if (query.archived === 'true') {
        conditions.push(isNotNull(digests.archivedAt));
      } else {
        conditions.push(isNull(digests.archivedAt));
      }
```

**2d.** Add `archived_at` to the select columns in `findAll` (after `created_at`):
```typescript
          created_at: digests.createdAt,
          archived_at: digests.archivedAt,
```

**2e.** Add `archived_at` to the select columns in `findById` (after `created_at`):
```typescript
          created_at: digests.createdAt,
          archived_at: digests.archivedAt,
```

**2f.** Add three new methods to `DigestService` (after `findById`, before the `// ── Private helpers ──` comment):

```typescript
  /**
   * Archive a digest (set archived_at = now).
   */
  async archive(userId: string, digestId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: digests.id })
        .from(digests)
        .where(eq(digests.id, digestId));

      if (!existing) {
        throw new NotFoundException('Digest not found');
      }

      await tx
        .update(digests)
        .set({ archivedAt: new Date() })
        .where(eq(digests.id, digestId));
    });
  }

  /**
   * Unarchive a digest (set archived_at = null).
   */
  async unarchive(userId: string, digestId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: digests.id })
        .from(digests)
        .where(eq(digests.id, digestId));

      if (!existing) {
        throw new NotFoundException('Digest not found');
      }

      await tx
        .update(digests)
        .set({ archivedAt: null })
        .where(eq(digests.id, digestId));
    });
  }

  /**
   * Permanently delete a digest (cascades to digest_items via FK).
   */
  async remove(userId: string, digestId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: digests.id })
        .from(digests)
        .where(eq(digests.id, digestId));

      if (!existing) {
        throw new NotFoundException('Digest not found');
      }

      await tx.delete(digests).where(eq(digests.id, digestId));
    });
  }
```

Note: `NotFoundException` needs to be imported. Add it to the existing `@nestjs/common` import:
```typescript
import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
```

- [ ] **Step 3: Add PATCH/DELETE endpoints to DigestController**

In `packages/backend/src/digest/digest.controller.ts`:

**3a.** Update the imports from `@nestjs/common` to add `Patch`, `Delete`:
```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
```

**3b.** Add three new endpoints after the `findOne` method (before `stream`):

```typescript
  /**
   * PATCH /digests/:id/archive — Archive a digest.
   */
  @Patch(':id/archive')
  @HttpCode(204)
  async archive(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.archive(userId, id);
  }

  /**
   * PATCH /digests/:id/unarchive — Restore an archived digest.
   */
  @Patch(':id/unarchive')
  @HttpCode(204)
  async unarchive(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.unarchive(userId, id);
  }

  /**
   * DELETE /digests/:id — Permanently delete a digest.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.remove(userId, id);
  }
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

---

## Chunk 2: Frontend — API Client + Feed Page + Digests Page

### Task 5: Frontend API Client Methods

**Files:**
- Modify: `packages/frontend/src/lib/api-client.ts`

- [ ] **Step 1: Add `archived` to ContentQuery interface**

In `packages/frontend/src/lib/api-client.ts`, update the `ContentQuery` interface (around line 257):

```typescript
export interface ContentQuery {
  page?: number;
  limit?: number;
  platform?: string;
  content_type?: string;
  from?: string;
  to?: string;
  search?: string;
  archived?: boolean;
}
```

- [ ] **Step 2: Add archive/unarchive/delete methods to `contentApi`**

After the existing `getById` method in `contentApi` (around line 281), add:

```typescript
  archive(id: string): Promise<void> {
    return apiClient.patch(`/content/${id}/archive`);
  },

  unarchive(id: string): Promise<void> {
    return apiClient.patch(`/content/${id}/unarchive`);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/content/${id}`);
  },
```

- [ ] **Step 3: Add `archived` to digestsApi `list` query parameter + add archive/unarchive/delete methods**

Update the `digestsApi.list` method signature to accept `archived` (around line 380):

```typescript
  list(query: { page?: number; limit?: number; type?: string; archived?: boolean } = {}): Promise<DigestsResponse> {
```

After the existing `generate` method (around line 397), add:

```typescript
  archive(id: string): Promise<void> {
    return apiClient.patch(`/digests/${id}/archive`);
  },

  unarchive(id: string): Promise<void> {
    return apiClient.patch(`/digests/${id}/unarchive`);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/digests/${id}`);
  },
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

---

### Task 6: Frontend Feed Page — Tabs + Action Buttons

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/feed/page.tsx`

- [ ] **Step 1: Add archived tab state and pass to query**

Add a state variable and include `archived` in the query key + API call:

```typescript
// Add after the existing state declarations (around line 13):
const [showArchived, setShowArchived] = useState(false);

// Update queryKey to include showArchived:
queryKey: ['content', platform, search, showArchived],

// Update queryFn to include archived param:
queryFn: ({ pageParam = 1 }) =>
  contentApi.list({
    page: pageParam,
    limit: LIMIT,
    platform: platform || undefined,
    search: search || undefined,
    archived: showArchived || undefined,
  }),
```

- [ ] **Step 2: Add tab bar UI between heading and search**

Add archive tab toggle in the page, after the `<h1>` and before the search form:

```tsx
{/* Archive tabs */}
<div className="flex gap-1 mb-4 border-b border-gray-200">
  <button
    onClick={() => setShowArchived(false)}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      !showArchived
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    全部
  </button>
  <button
    onClick={() => setShowArchived(true)}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      showArchived
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    已归档
  </button>
</div>
```

- [ ] **Step 3: Refactor ContentCard — replace `<a>` wrapper with `<div>`, add action buttons**

The current `ContentCard` wraps everything in an `<a>` tag (line 191). We need to:
1. Change the outer `<a>` to a `<div>`
2. Make the title a clickable link instead
3. Add archive/unarchive and delete buttons

Replace the entire `ContentCard` function:

```tsx
function ContentCard({
  item,
  showArchived,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  item: ContentItem;
  showArchived: boolean;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const platformColors: Record<string, string> = {
    github: 'bg-gray-800 text-white',
    youtube: 'bg-red-600 text-white',
    twitter: 'bg-blue-500 text-white',
  };

  const badgeClass = platformColors[item.platform] || 'bg-gray-200 text-gray-800';

  return (
    <div className="p-5 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Platform badge + content type */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${badgeClass}`}>
              {item.platform}
            </span>
            <span className="text-xs text-gray-400 capitalize">{item.content_type}</span>
          </div>

          {/* Title as link */}
          {item.title && (
            <a
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 mb-1 truncate block hover:text-blue-600 hover:underline"
            >
              {item.title}
            </a>
          )}

          {/* Body preview */}
          {item.body && <p className="text-sm text-gray-600 line-clamp-3">{item.body}</p>}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            {item.author_name && <span>by {item.author_name}</span>}
            <span>{new Date(item.published_at).toLocaleDateString()}</span>
            {item.ai_summary && (
              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">
                AI Summary
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0">
          {showArchived ? (
            <button
              onClick={() => onUnarchive(item.id)}
              title="恢复"
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M4.293 9.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => onArchive(item.id)}
              title="归档"
              className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            title="删除"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* AI Summary section */}
      {item.ai_summary && (
        <div className="mt-3 p-3 bg-purple-50 rounded-md">
          <p className="text-sm text-purple-800">{item.ai_summary}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add mutation hooks and wire up ContentCard actions in FeedPage**

Add imports and mutations inside `FeedPage`:

```typescript
// Update imports at top:
import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/lib/api-client';
import type { ContentItem } from '@/lib/api-client';

// Inside FeedPage, add after the state declarations:
const queryClient = useQueryClient();

const archiveMutation = useMutation({
  mutationFn: (id: string) => contentApi.archive(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
});

const unarchiveMutation = useMutation({
  mutationFn: (id: string) => contentApi.unarchive(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => contentApi.delete(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
});
```

Update the ContentCard rendering to pass the new props:

```tsx
{allItems.map((item) => (
  <ContentCard
    key={item.id}
    item={item}
    showArchived={showArchived}
    onArchive={(id) => archiveMutation.mutate(id)}
    onUnarchive={(id) => unarchiveMutation.mutate(id)}
    onDelete={(id) => deleteMutation.mutate(id)}
  />
))}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

---

### Task 7: Frontend Digests Page — Tabs + Action Buttons

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/digests/page.tsx`

- [ ] **Step 1: Add archived tab state and pass to query**

```typescript
// Add after the existing state declarations (around line 12):
const [showArchived, setShowArchived] = useState(false);

// Update queryKey to include showArchived:
queryKey: ['digests', typeFilter, showArchived],

// Update queryFn to include archived param:
queryFn: () => digestsApi.list({
  type: typeFilter || undefined,
  archived: showArchived || undefined,
}),
```

- [ ] **Step 2: Add archive tab bar**

Add a tab bar between the header row and the type filter chips. Place it right after the header `<div>` (the one with h1 + generate buttons) and before the type filter chips:

```tsx
{/* Archive tabs */}
<div className="flex gap-1 mb-4 border-b border-gray-200">
  <button
    onClick={() => setShowArchived(false)}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      !showArchived
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    全部
  </button>
  <button
    onClick={() => setShowArchived(true)}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      showArchived
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    已归档
  </button>
</div>
```

- [ ] **Step 3: Add mutation hooks for archive/unarchive/delete**

```typescript
// Update import to add useMutation:
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Inside DigestsPage, add mutations:
const archiveMutation = useMutation({
  mutationFn: (id: string) => digestsApi.archive(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    setSelectedDigest(null);
  },
});

const unarchiveMutation = useMutation({
  mutationFn: (id: string) => digestsApi.unarchive(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    setSelectedDigest(null);
  },
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => digestsApi.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    setSelectedDigest(null);
  },
});
```

- [ ] **Step 4: Update DigestCard to include action buttons**

Update the `DigestCard` component to accept and display action buttons:

```tsx
function DigestCard({
  digest,
  isSelected,
  onSelect,
  showArchived,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  digest: Digest;
  isSelected: boolean;
  onSelect: () => void;
  showArchived: boolean;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    generating: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };

  const typeColors: Record<string, string> = {
    daily: 'bg-blue-50 text-blue-600',
    weekly: 'bg-purple-50 text-purple-600',
  };

  return (
    <div
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-50 border-blue-300 shadow-sm'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between">
        <button onClick={onSelect} className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColors[digest.digest_type] || 'bg-gray-100 text-gray-600'}`}
            >
              {digest.digest_type}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColors[digest.status] || 'bg-gray-100 text-gray-600'}`}
            >
              {digest.status}
            </span>
          </div>

          <div className="text-sm text-gray-700 mb-1">
            {new Date(digest.period_start).toLocaleDateString()} &ndash;{' '}
            {new Date(digest.period_end).toLocaleDateString()}
          </div>

          <div className="text-xs text-gray-400">
            {digest.item_count} items
            {digest.generated_at && (
              <> &middot; Generated {new Date(digest.generated_at).toLocaleString()}</>
            )}
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0 ml-2">
          {showArchived ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnarchive(digest.id); }}
              title="恢复"
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M4.293 9.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(digest.id); }}
              title="归档"
              className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(digest.id); }}
            title="删除"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update DigestCard rendering in DigestsPage to pass new props**

```tsx
{digests.map((digest) => (
  <DigestCard
    key={digest.id}
    digest={digest}
    isSelected={selectedDigest?.id === digest.id}
    onSelect={() => setSelectedDigest(digest)}
    showArchived={showArchived}
    onArchive={(id) => archiveMutation.mutate(id)}
    onUnarchive={(id) => unarchiveMutation.mutate(id)}
    onDelete={(id) => deleteMutation.mutate(id)}
  />
))}
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: All 3 packages build successfully.

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

---

## Final Verification

- [ ] **Run full build**: `pnpm build` — all 3 packages pass
- [ ] **Run all tests**: `pnpm test` — all tests pass
- [ ] **Verify no LSP errors**: Run diagnostics on all modified files
