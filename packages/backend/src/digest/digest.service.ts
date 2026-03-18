import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gte, lte, sql, count, desc } from 'drizzle-orm';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { contentItems, digests, digestItems, users } from '../common/database/schema';
import {
  buildBatchMapPrompt,
  buildReducePrompt,
  buildSimpleSummaryPrompt,
  batchItems,
  type ContentItemForDigest,
  type ItemSummary,
  type TopicGroup,
  type DigestResult,
} from './prompts/digest.prompts';

/** Progress event emitted during SSE streaming */
export interface DigestProgressEvent {
  type: 'progress' | 'topic' | 'complete' | 'error';
  data: Record<string, unknown>;
}

/** Callback for streaming progress updates */
export type ProgressCallback = (event: DigestProgressEvent) => void;

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private openai: OpenAI | null = null;
  private gemini: GoogleGenerativeAI | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {
    const openAiKey = this.configService.get<string>('openai.apiKey');
    if (openAiKey) {
      this.openai = new OpenAI({ apiKey: openAiKey });
    }

    const geminiKey = this.configService.get<string>('gemini.apiKey');
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
    }
  }

  /**
   * Generate a digest for the given user and time period.
   * Uses map-reduce: batch-summarize items → group by topic → trend analysis.
   */
  async generateDigest(
    userId: string,
    digestType: string,
    periodStart: Date,
    periodEnd: Date,
    language: string,
    onProgress?: ProgressCallback,
  ): Promise<string> {
    // 1. Create a pending digest record
    const digestId = await this.createPendingDigest(
      userId,
      digestType,
      periodStart,
      periodEnd,
      language,
    );

    try {
      // 2. Mark as generating
      await this.updateDigestStatus(userId, digestId, 'generating');

      // 3. Fetch content items for the period
      const items = await this.fetchContentForPeriod(userId, periodStart, periodEnd);

      if (items.length === 0) {
        // No content → mark completed with empty result
        await this.completeDigest(userId, digestId, {
          topic_groups: [],
          trend_analysis: '',
          item_count: 0,
        });
        onProgress?.({
          type: 'complete',
          data: { digest_id: digestId, status: 'completed', item_count: 0 },
        });
        return digestId;
      }

      onProgress?.({
        type: 'progress',
        data: { stage: 'fetching', progress: 0.1, item_count: items.length },
      });

      let result: DigestResult;

      if (items.length < 5) {
        // Simple case: individual summaries
        result = await this.generateSimpleDigest(items, language, onProgress);
      } else {
        // Full map-reduce pipeline
        result = await this.generateMapReduceDigest(items, language, onProgress);
      }

      // 4. Save completed digest and link items
      await this.completeDigest(userId, digestId, result);
      await this.linkDigestItems(
        userId,
        digestId,
        items.map((i) => i.id),
      );

      onProgress?.({
        type: 'complete',
        data: { digest_id: digestId, status: 'completed' },
      });

      return digestId;
    } catch (error) {
      this.logger.error(`Digest generation failed: ${error}`);
      await this.updateDigestStatus(userId, digestId, 'failed');
      onProgress?.({
        type: 'error',
        data: { digest_id: digestId, error: String(error) },
      });
      throw error;
    }
  }

  /**
   * List digests for a user with pagination.
   */
  async findAll(userId: string, query: { page?: number; limit?: number; type?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    return withRlsContext(this.db, userId, async (tx) => {
      const conditions = [];
      if (query.type) {
        conditions.push(eq(digests.digestType, query.type));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ count: total }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(digests)
        .where(whereClause);

      const rows = await tx
        .select({
          id: digests.id,
          digest_type: digests.digestType,
          period_start: digests.periodStart,
          period_end: digests.periodEnd,
          language: digests.language,
          item_count: digests.itemCount,
          status: digests.status,
          generated_at: digests.generatedAt,
          topic_groups: digests.topicGroups,
          trend_analysis: digests.trendAnalysis,
          created_at: digests.createdAt,
        })
        .from(digests)
        .where(whereClause)
        .orderBy(desc(digests.periodEnd))
        .limit(limit)
        .offset(offset);

      return {
        digests: rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
        },
      };
    });
  }

  /**
   * Get a single digest by ID.
   */
  async findById(userId: string, digestId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({
          id: digests.id,
          digest_type: digests.digestType,
          period_start: digests.periodStart,
          period_end: digests.periodEnd,
          language: digests.language,
          item_count: digests.itemCount,
          status: digests.status,
          generated_at: digests.generatedAt,
          topic_groups: digests.topicGroups,
          trend_analysis: digests.trendAnalysis,
          created_at: digests.createdAt,
        })
        .from(digests)
        .where(eq(digests.id, digestId));

      return row ?? null;
    });
  }

  // ── Private helpers ──

  private async createPendingDigest(
    userId: string,
    digestType: string,
    periodStart: Date,
    periodEnd: Date,
    language: string,
  ): Promise<string> {
    return withRlsContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(digests)
        .values({
          userId,
          digestType,
          periodStart,
          periodEnd,
          language,
          topicGroups: [],
          itemCount: 0,
          status: 'pending',
        })
        .returning({ id: digests.id });
      return row.id;
    });
  }

  private async updateDigestStatus(
    userId: string,
    digestId: string,
    status: string,
  ): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      await tx.update(digests).set({ status }).where(eq(digests.id, digestId));
    });
  }

  private async completeDigest(
    userId: string,
    digestId: string,
    result: DigestResult,
  ): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      await tx
        .update(digests)
        .set({
          topicGroups: result.topic_groups,
          trendAnalysis: result.trend_analysis,
          itemCount: result.item_count,
          status: 'completed',
          generatedAt: new Date(),
        })
        .where(eq(digests.id, digestId));
    });
  }

  private async linkDigestItems(
    userId: string,
    digestId: string,
    itemIds: string[],
  ): Promise<void> {
    if (itemIds.length === 0) return;

    await withRlsContext(this.db, userId, async (tx) => {
      await tx.insert(digestItems).values(
        itemIds.map((contentItemId) => ({
          digestId,
          contentItemId,
        })),
      );
    });
  }

  private async fetchContentForPeriod(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ContentItemForDigest[]> {
    return withRlsContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select({
          id: contentItems.id,
          platform: contentItems.platform,
          content_type: contentItems.contentType,
          title: contentItems.title,
          body: contentItems.body,
          author_name: contentItems.authorName,
          original_url: contentItems.originalUrl,
          published_at: contentItems.publishedAt,
          metadata: contentItems.metadata,
        })
        .from(contentItems)
        .where(
          and(gte(contentItems.publishedAt, periodStart), lte(contentItems.publishedAt, periodEnd)),
        )
        .orderBy(contentItems.publishedAt);

      return rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        content_type: r.content_type,
        title: r.title,
        body: r.body,
        author_name: r.author_name,
        original_url: r.original_url,
        published_at: (r.published_at as Date).toISOString(),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      }));
    });
  }

  /**
   * Simple digest: <5 items, just summarize individually.
   */
  private async generateSimpleDigest(
    items: ContentItemForDigest[],
    language: string,
    onProgress?: ProgressCallback,
  ): Promise<DigestResult> {
    onProgress?.({
      type: 'progress',
      data: { stage: 'summarizing', progress: 0.3 },
    });

    const prompt = buildSimpleSummaryPrompt(items, language);
    const response = await this.callAI(prompt);
    const parsed = this.parseJsonResponse<{
      topic_groups: TopicGroup[];
      trend_analysis: string;
    }>(response);

    return {
      topic_groups: parsed.topic_groups,
      trend_analysis: parsed.trend_analysis || '',
      item_count: items.length,
    };
  }

  /**
   * Full map-reduce pipeline for >=5 items.
   */
  private async generateMapReduceDigest(
    items: ContentItemForDigest[],
    language: string,
    onProgress?: ProgressCallback,
  ): Promise<DigestResult> {
    // MAP phase: batch-summarize items (5 per batch)
    const batches = batchItems(items, 5);
    const allSummaries: ItemSummary[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const progress = 0.1 + (0.5 * (i + 1)) / batches.length;

      onProgress?.({
        type: 'progress',
        data: {
          stage: 'summarizing',
          progress,
          current_batch: i + 1,
          total_batches: batches.length,
        },
      });

      const prompt = buildBatchMapPrompt(batch, language);
      const response = await this.callAI(prompt);
      const batchSummaries = this.parseJsonResponse<{ id: string; summary: string }[]>(response);

      // Map back to ItemSummary with platform info
      for (const bs of batchSummaries) {
        const originalItem = items.find((item) => item.id === bs.id);
        allSummaries.push({
          id: bs.id,
          platform: originalItem?.platform ?? 'unknown',
          summary: bs.summary,
        });
      }
    }

    // REDUCE phase: group by topic + trend analysis
    onProgress?.({
      type: 'progress',
      data: { stage: 'grouping', progress: 0.7 },
    });

    const reducePrompt = buildReducePrompt(allSummaries, language);
    const reduceResponse = await this.callAI(reducePrompt);
    const result = this.parseJsonResponse<{
      topic_groups: TopicGroup[];
      trend_analysis: string;
    }>(reduceResponse);

    // Emit each topic group
    for (const group of result.topic_groups) {
      onProgress?.({
        type: 'topic',
        data: { topic: group.topic, summary: group.summary },
      });
    }

    return {
      topic_groups: result.topic_groups,
      trend_analysis: result.trend_analysis || '',
      item_count: items.length,
    };
  }

  /**
   * Call AI API (prefers Gemini, falls back to OpenAI). Falls back to a stub if no API key is configured.
   */
  private async callAI(prompt: string): Promise<string> {
    const systemPrompt = 'You are an AI content curator that generates structured JSON responses.';

    if (this.gemini) {
      try {
        const model = this.gemini.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: systemPrompt,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        this.logger.error(`Gemini generation failed: ${error}`);
        // Fallthrough to OpenAI or stub if Gemini fails
      }
    }

    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });
        return response.choices[0]?.message?.content ?? '{}';
      } catch (error) {
        this.logger.error(`OpenAI generation failed: ${error}`);
      }
    }

    // No API key or both failed — return a mock/stub response for development
    this.logger.warn('No valid AI API key configured or calls failed; returning stub response');
    return this.stubAIResponse(prompt);
  }

  /**
   * Stub response when no API key is configured.
   */
  private stubAIResponse(prompt: string): string {
    // Detect which type of prompt this is
    if (prompt.includes('Summarize each of the following content items in 1-3 sentences each')) {
      // Batch MAP prompt — extract item IDs from the prompt
      const idMatches = prompt.match(/\(id: ([^,]+),/g) ?? [];
      const ids = idMatches.map((m) => m.replace('(id: ', '').replace(',', ''));
      return JSON.stringify(ids.map((id) => ({ id, summary: `Summary of item ${id}` })));
    }

    if (prompt.includes('topic_groups') && prompt.includes('trend_analysis')) {
      // REDUCE or SIMPLE prompt — extract item IDs
      const idMatches = prompt.match(/\(id: ([^,)]+)/g) ?? [];
      const ids = idMatches.map((m) => m.replace('(id: ', ''));
      const platforms = [
        ...new Set(
          (prompt.match(/platform: (\w+)/g) ?? []).map((m) => m.replace('platform: ', '')),
        ),
      ];

      return JSON.stringify({
        topic_groups: [
          {
            topic: 'General Updates',
            summary: 'A collection of updates from various platforms.',
            item_ids: ids,
            platforms: platforms.length > 0 ? platforms : ['unknown'],
          },
        ],
        trend_analysis: 'Cross-platform analysis of recent content.',
      });
    }

    // Fallback
    return '{}';
  }

  /**
   * Parse JSON from an OpenAI response, stripping markdown fences if present.
   */
  private parseJsonResponse<T>(response: string): T {
    let cleaned = response.trim();
    // Strip markdown code fences
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      this.logger.error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
      throw new Error('Failed to parse AI response');
    }
  }
}
