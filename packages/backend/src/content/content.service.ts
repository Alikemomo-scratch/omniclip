import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lte, or, ilike, sql, count } from 'drizzle-orm';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { contentItems } from '../common/database/schema';
import type { ContentQueryDto } from './dto';

/** Shape of items passed to upsertMany. */
export interface ContentItemInput {
  connectionId: string;
  platform: string;
  externalId: string;
  contentType: string;
  title?: string | null;
  body?: string | null;
  originalUrl: string;
  publishedAt: Date;
  authorName?: string | null;
  authorUrl?: string | null;
  mediaUrls?: unknown[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ContentService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * List content items with pagination and optional filters.
   * Filters: platform, content_type, from/to date range, search (title/body ilike).
   */
  async findAll(
    userId: string,
    query: ContentQueryDto,
  ): Promise<{
    items: unknown[];
    pagination: { page: number; limit: number; total: number; total_pages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offsetVal = (page - 1) * limit;

    return withRlsContext(this.db, userId, async (tx) => {
      // Build dynamic where conditions
      const conditions = this.buildWhereConditions(query);

      // Count query
      const [{ count: total }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(contentItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Data query
      const items = await tx
        .select({
          id: contentItems.id,
          platform: contentItems.platform,
          content_type: contentItems.contentType,
          title: contentItems.title,
          body: contentItems.body,
          author_name: contentItems.authorName,
          author_url: contentItems.authorUrl,
          original_url: contentItems.originalUrl,
          media_urls: contentItems.mediaUrls,
          metadata: contentItems.metadata,
          published_at: contentItems.publishedAt,
          collected_at: contentItems.collectedAt,
          ai_summary: contentItems.aiSummary,
        })
        .from(contentItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(sql`${contentItems.publishedAt} DESC`)
        .limit(limit)
        .offset(offsetVal);

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages,
        },
      };
    });
  }

  /**
   * Get a single content item by ID (RLS-scoped).
   */
  async findById(userId: string, itemId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [item] = await tx
        .select({
          id: contentItems.id,
          platform: contentItems.platform,
          content_type: contentItems.contentType,
          title: contentItems.title,
          body: contentItems.body,
          author_name: contentItems.authorName,
          author_url: contentItems.authorUrl,
          original_url: contentItems.originalUrl,
          media_urls: contentItems.mediaUrls,
          metadata: contentItems.metadata,
          published_at: contentItems.publishedAt,
          collected_at: contentItems.collectedAt,
          ai_summary: contentItems.aiSummary,
        })
        .from(contentItems)
        .where(eq(contentItems.id, itemId));

      if (!item) {
        throw new NotFoundException('Content item not found');
      }

      return item;
    });
  }

  /**
   * Batch upsert content items with deduplication on (userId, platform, externalId).
   * Returns the number of upserted rows.
   */
  async upsertMany(userId: string, items: ContentItemInput[]): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    return withRlsContext(this.db, userId, async (tx) => {
      const rows = items.map((item) => ({
        userId,
        connectionId: item.connectionId,
        platform: item.platform,
        externalId: item.externalId,
        contentType: item.contentType,
        title: item.title ?? null,
        body: item.body ?? null,
        originalUrl: item.originalUrl,
        publishedAt: item.publishedAt,
        authorName: item.authorName ?? null,
        authorUrl: item.authorUrl ?? null,
        mediaUrls: item.mediaUrls ?? [],
        metadata: item.metadata ?? {},
      }));

      const result = await tx
        .insert(contentItems)
        .values(rows)
        .onConflictDoUpdate({
          target: [contentItems.userId, contentItems.platform, contentItems.externalId],
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            mediaUrls: sql`excluded.media_urls`,
            metadata: sql`excluded.metadata`,
            authorName: sql`excluded.author_name`,
            authorUrl: sql`excluded.author_url`,
            originalUrl: sql`excluded.original_url`,
            publishedAt: sql`excluded.published_at`,
          },
        })
        .returning({ id: contentItems.id });

      return result.length;
    });
  }

  /**
   * Build dynamic WHERE conditions from query DTO.
   */
  private buildWhereConditions(query: ContentQueryDto) {
    const conditions = [];

    if (query.platform) {
      conditions.push(eq(contentItems.platform, query.platform));
    }

    if (query.content_type) {
      conditions.push(eq(contentItems.contentType, query.content_type));
    }

    if (query.from) {
      conditions.push(gte(contentItems.publishedAt, new Date(query.from)));
    }

    if (query.to) {
      conditions.push(lte(contentItems.publishedAt, new Date(query.to)));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(or(ilike(contentItems.title, pattern), ilike(contentItems.body, pattern)));
    }

    return conditions;
  }
}
