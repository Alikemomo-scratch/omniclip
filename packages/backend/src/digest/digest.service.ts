import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gte, lte, sql, count, desc, isNull, isNotNull } from 'drizzle-orm';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { contentItems, digests, digestItems, users } from '../common/database/schema';
import {
  formatContentItems,
  splitPromptTemplate,
  DEFAULT_PHASE1_PROMPT,
  DEFAULT_PHASE2_PROMPT,
  PHASE1_JSON_SCHEMA,
  PHASE2_JSON_SCHEMA,
  normalizeDigestConfig,
  buildPhase1PromptFromConfig,
  DEMOTED_HEADLINE_PLACEHOLDER,
  type DigestConfig,
  type ContentItemForDigest,
  type Phase1Result,
  type DigestOutput,
  type DigestHeadline,
  type DigestCategory,
  type DigestResult,
} from './prompts/digest.prompts';
import {
  validatePhase1Response,
  validatePhase2Response,
  deduplicatePhase1Result,
} from './prompts/digest.validators';

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
   * Two-phase pipeline: screen+classify → deep-dive headlines.
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
        // No content → save canonical empty shape
        const emptyOutput: DigestOutput = {
          headlines: [],
          categories: [],
          trend_analysis: '',
        };
        await this.completeDigest(userId, digestId, {
          topic_groups: emptyOutput,
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

      // 4. Fetch user settings and resolve prompts
      const { digestConfig, digestPrompt } = await this.fetchUserSettings(userId);
      const { phase1: phase1Prompt, phase2: phase2Prompt } = this.resolvePrompts(digestConfig, digestPrompt);

      // 5. Build source data lookup map
      const sourceMap = new Map(items.map((item) => [item.id, item]));

      // Build index↔UUID maps (LLMs use short indices, pipeline uses real UUIDs)
      const indexToId = new Map<string, string>();
      items.forEach((item, i) => indexToId.set(String(i + 1), item.id));
      const validIndices = new Set(indexToId.keys());

      // 6. Phase 1: Screen & Classify (500 char body)
      onProgress?.({
        type: 'progress',
        data: { stage: 'screening', progress: 0.2 },
      });

      const phase1Result = await this.executePhase1(
        phase1Prompt,
        items,
        validIndices,
        indexToId,
        language,
        digestConfig.headlineCount,
      );

      if (!phase1Result) {
        // Phase 1 completely failed — mark digest as failed
        await this.updateDigestStatus(userId, digestId, 'failed');
        onProgress?.({
          type: 'error',
          data: { digest_id: digestId, error: 'Phase 1 failed: could not classify content' },
        });
        throw new Error('Phase 1 failed: could not classify content');
      }

      // Replace demoted headline placeholders with source content titles
      for (const cat of phase1Result.categories) {
        for (const catItem of cat.items) {
          if (catItem.one_liner === DEMOTED_HEADLINE_PLACEHOLDER) {
            const source = sourceMap.get(catItem.item_id);
            catItem.one_liner = source?.title ?? catItem.one_liner;
          }
        }
      }

      onProgress?.({
        type: 'progress',
        data: {
          stage: 'screening_complete',
          progress: 0.5,
          headline_count: phase1Result.headlines.length,
          category_count: phase1Result.categories.length,
        },
      });

      // 7. Phase 2: Deep-dive headlines (3000 char body)
      let finalHeadlines: DigestHeadline[] = [];

      if (phase1Result.headlines.length > 0) {
        onProgress?.({
          type: 'progress',
          data: { stage: 'deep_dive', progress: 0.6 },
        });

        finalHeadlines = await this.executePhase2(
          phase2Prompt,
          phase1Result.headlines,
          items,
          sourceMap,
          language,
        );
      }

      // 8. Back-fill system fields on categories
      const finalCategories: DigestCategory[] = phase1Result.categories.map((cat) => ({
        topic: cat.topic,
        items: cat.items.map((ci) => {
          const source = sourceMap.get(ci.item_id);
          return {
            item_id: ci.item_id,
            one_liner: ci.one_liner,
            platform: source?.platform ?? 'unknown',
            original_url: source?.original_url ?? '',
          };
        }),
      }));

      // 9. Assemble final DigestOutput
      const digestOutput: DigestOutput = {
        headlines: finalHeadlines,
        categories: finalCategories,
        trend_analysis: phase1Result.trend_analysis,
      };

      // 10. Save and link
      await this.completeDigest(userId, digestId, {
        topic_groups: digestOutput,
        trend_analysis: phase1Result.trend_analysis,
        item_count: items.length,
      });
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
      // Only update to failed if not already set
      try {
        await this.updateDigestStatus(userId, digestId, 'failed');
      } catch {
        // Status may already be set
      }
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
  async findAll(
    userId: string,
    query: { page?: number; limit?: number; type?: string; archived?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    return withRlsContext(this.db, userId, async (tx) => {
      const conditions = [];
      if (query.type) {
        conditions.push(eq(digests.digestType, query.type));
      }
      if (query.archived === 'true') {
        conditions.push(isNotNull(digests.archivedAt));
      } else {
        conditions.push(isNull(digests.archivedAt));
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
          archived_at: digests.archivedAt,
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
          archived_at: digests.archivedAt,
        })
        .from(digests)
        .where(eq(digests.id, digestId));

      return row ?? null;
    });
  }

  async archive(userId: string, digestId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: digests.id })
        .from(digests)
        .where(eq(digests.id, digestId));

      if (!existing) {
        throw new NotFoundException('Digest not found');
      }

      await tx.update(digests).set({ archivedAt: new Date() }).where(eq(digests.id, digestId));
    });
  }

  async unarchive(userId: string, digestId: string): Promise<void> {
    await withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: digests.id })
        .from(digests)
        .where(eq(digests.id, digestId));

      if (!existing) {
        throw new NotFoundException('Digest not found');
      }

      await tx.update(digests).set({ archivedAt: null }).where(eq(digests.id, digestId));
    });
  }

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

  private async fetchUserSettings(userId: string): Promise<{
    digestConfig: DigestConfig;
    digestPrompt: string | null;
  }> {
    return withRlsContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({
          digestConfig: users.digestConfig,
          digestPrompt: users.digestPrompt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return {
        digestConfig: normalizeDigestConfig(row?.digestConfig),
        digestPrompt: row?.digestPrompt ?? null,
      };
    });
  }

  private resolvePrompts(
    config: DigestConfig,
    rawPrompt: string | null,
  ): { phase1: string; phase2: string } {
    if (config.mode === 'raw') {
      return splitPromptTemplate(rawPrompt);
    }
    return {
      phase1: buildPhase1PromptFromConfig(config),
      phase2: DEFAULT_PHASE2_PROMPT,
    };
  }

  // ── Phase 1: Screen & Classify ──

  /**
   * Phase 1: Screen & classify all content items.
   * Tries user prompt first, falls back to default on validation failure.
   * Returns null if transport fails (all retries exhausted) OR both prompts fail validation.
   */
  private async executePhase1(
    userPhase1Prompt: string,
    items: ContentItemForDigest[],
    validIndices: Set<string>,
    indexToId: Map<string, string>,
    language: string,
    headlineCount?: number,
  ): Promise<Phase1Result | null> {
    const formattedItems = formatContentItems(items, 500);
    const contentBlock = formattedItems.join('\n\n');
    const langInstruction = this.buildLanguageInstruction(language);

    try {
      const userFullPrompt = this.buildPhase1FullPrompt(userPhase1Prompt, langInstruction, contentBlock);
      const userResult = await this.tryPhase1(userFullPrompt, validIndices, headlineCount);
      if (userResult) return this.remapPhase1Ids(userResult, indexToId);

      this.logger.warn('Phase 1 prompt failed validation, retrying with default prompt');
      const defaultFullPrompt = this.buildPhase1FullPrompt(DEFAULT_PHASE1_PROMPT, langInstruction, contentBlock);
      const defaultResult = await this.tryPhase1(defaultFullPrompt, validIndices, headlineCount);
      return defaultResult ? this.remapPhase1Ids(defaultResult, indexToId) : null;
    } catch (error) {
      this.logger.error(`Phase 1 transport failure after all retries: ${error}`);
      return null;
    }
  }

  private buildPhase1FullPrompt(
    instruction: string,
    langInstruction: string,
    contentBlock: string,
  ): string {
    return `${instruction}\n\n${langInstruction}\n\n${PHASE1_JSON_SCHEMA}\n\nContent items:\n${contentBlock}`;
  }

  private async tryPhase1(
    prompt: string,
    validIndices: Set<string>,
    headlineCount?: number,
  ): Promise<Phase1Result | null> {
    const response = await this.callAIWithRetry(prompt);
    const validation = validatePhase1Response(response, validIndices, headlineCount);
    if (!validation.ok) {
      this.logger.warn(`Phase 1 validation failed: ${validation.error}`);
      return null;
    }
    if (validation.demotedHeadlineCount > 0) {
      this.logger.warn(
        `Phase 1: ${validation.demotedHeadlineCount} headlines exceeded cap of ${headlineCount ?? 10}, demoted to categories`,
      );
    }
    const headlineIds = new Set(validation.value.headlines.map((h) => h.item_id));
    return deduplicatePhase1Result(validation.value, [...headlineIds]);
  }

  private remapPhase1Ids(result: Phase1Result, indexToId: Map<string, string>): Phase1Result {
    return {
      headlines: result.headlines.map((h) => ({
        ...h,
        item_id: indexToId.get(h.item_id) ?? h.item_id,
      })),
      categories: result.categories.map((c) => ({
        ...c,
        items: c.items.map((i) => ({
          ...i,
          item_id: indexToId.get(i.item_id) ?? i.item_id,
        })),
      })),
      trend_analysis: result.trend_analysis,
    };
  }

  // ── Phase 2: Deep-dive Headlines ──

  /**
   * Phase 2: Deep-dive analysis for headline items.
   * Tries user prompt first, falls back to default on validation failure.
   * Transport exhaustion → returns empty (digest completes with categories only).
   * Returns whatever headlines succeed — partial results are OK.
   */
  private async executePhase2(
    userPhase2Prompt: string,
    phase1Headlines: { item_id: string; topic: string }[],
    allItems: ContentItemForDigest[],
    sourceMap: Map<string, ContentItemForDigest>,
    language: string,
  ): Promise<DigestHeadline[]> {
    const headlineItems = phase1Headlines
      .map((h) => sourceMap.get(h.item_id))
      .filter((item): item is ContentItemForDigest => item !== undefined);

    if (headlineItems.length === 0) return [];

    // Phase 2 gets its own index mapping (subset of items, re-indexed from 1)
    const p2IndexToId = new Map<string, string>();
    headlineItems.forEach((item, i) => p2IndexToId.set(String(i + 1), item.id));
    const validP2Indices = new Set(p2IndexToId.keys());

    const formattedItems = formatContentItems(headlineItems, 3000);
    const contentBlock = formattedItems.join('\n\n');
    const langInstruction = this.buildLanguageInstruction(language);

    const topicMap = new Map(phase1Headlines.map((h) => [h.item_id, h.topic]));

    let phase2Results: import('./prompts/digest.prompts').Phase2HeadlineResult[] | null = null;

    try {
      const userFullPrompt = this.buildPhase2FullPrompt(userPhase2Prompt, langInstruction, contentBlock);
      phase2Results = await this.tryPhase2(userFullPrompt, validP2Indices);

      if (!phase2Results) {
        this.logger.warn('Phase 2 user prompt failed validation, retrying with default prompt');
        const defaultFullPrompt = this.buildPhase2FullPrompt(DEFAULT_PHASE2_PROMPT, langInstruction, contentBlock);
        phase2Results = await this.tryPhase2(defaultFullPrompt, validP2Indices);
      }
    } catch (error) {
      this.logger.error(`Phase 2 transport failure after all retries: ${error}`);
      return [];
    }

    if (!phase2Results || phase2Results.length === 0) {
      this.logger.warn('Phase 2 completely failed — digest will have categories only');
      return [];
    }

    // Remap indices back to real UUIDs
    const remapped = phase2Results.map((r) => ({
      ...r,
      item_id: p2IndexToId.get(r.item_id) ?? r.item_id,
    }));

    const returnedIds = new Set(remapped.map((r) => r.item_id));
    const missingIds = phase1Headlines
      .map((h) => h.item_id)
      .filter((id) => !returnedIds.has(id));
    if (missingIds.length > 0) {
      this.logger.warn(`Phase 2: ${missingIds.length} headlines missing analysis: ${missingIds.join(', ')}`);
    }

    return remapped.map((r) => {
      const source = sourceMap.get(r.item_id);
      return {
        item_id: r.item_id,
        topic: topicMap.get(r.item_id) ?? 'Uncategorized',
        title: r.title,
        analysis: r.analysis,
        platform: source?.platform ?? 'unknown',
        original_url: source?.original_url ?? '',
      };
    });
  }

  private buildPhase2FullPrompt(
    instruction: string,
    langInstruction: string,
    contentBlock: string,
  ): string {
    return `${instruction}\n\n${langInstruction}\n\n${PHASE2_JSON_SCHEMA}\n\nHeadline items for detailed analysis:\n${contentBlock}`;
  }

  private async tryPhase2(
    prompt: string,
    validIndices: Set<string>,
  ): Promise<import('./prompts/digest.prompts').Phase2HeadlineResult[] | null> {
    const response = await this.callAIWithRetry(prompt);
    const validation = validatePhase2Response(response, validIndices);
    if (!validation.ok) {
      this.logger.warn(`Phase 2 validation failed: ${validation.error}`);
      return null;
    }
    return validation.value;
  }

  // ── Shared helpers ──

  private buildLanguageInstruction(language: string): string {
    if (language === 'zh') return 'Please respond in Chinese (中文).';
    return `Please respond in ${language}.`;
  }

  /**
   * Wrap callAI with retry logic for transport/timeout errors.
   * Spec: "Retry up to 2x with backoff" per phase (3 total attempts).
   * Only transport errors trigger retry — parse/schema failures fall through.
   */
  private async callAIWithRetry(prompt: string, maxRetries = 2): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callAI(prompt);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
          this.logger.warn(
            `LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Call AI API (prefers Gemini, falls back to OpenAI).
   * THROWS on transport errors — caller (callAIWithRetry) handles retries.
   * Returns stub ONLY when no API keys are configured at all.
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
        // If OpenAI is available, fall through to it. Otherwise, throw.
        if (!this.openai) throw error;
      }
    }

    if (this.openai) {
      // No response_format constraint — Phase 2 requires top-level JSON array (R2-4)
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content ?? '{}';
    }

    // No API keys configured at all — return stub for development
    this.logger.warn('No AI API key configured; returning stub response');
    return this.stubAIResponse(prompt);
  }

  /**
   * Stub response when no API key is configured.
   */
  private stubAIResponse(prompt: string): string {
    if (prompt.includes('"headlines"') && prompt.includes('"categories"')) {
      const indexMatches = prompt.match(/^\[(\d+)\]/gm) ?? [];
      const indices = indexMatches.map((m) => m.replace(/[[\]]/g, ''));

      const headlines = indices.slice(0, 2).map((idx) => ({ item_id: idx, topic: 'General' }));
      const categoryItems = indices.slice(2, 12).map((idx) => ({
        item_id: idx,
        one_liner: `[STUB] Summary of item ${idx}`,
      }));

      return JSON.stringify({
        headlines,
        categories: categoryItems.length > 0
          ? [{ topic: 'Other Updates', items: categoryItems }]
          : [],
        trend_analysis: '[STUB] No AI API key configured. This is placeholder content.',
      });
    }

    if (prompt.includes('"title"') && prompt.includes('"analysis"')) {
      const indexMatches = prompt.match(/^\[(\d+)\]/gm) ?? [];
      const indices = indexMatches.map((m) => m.replace(/[[\]]/g, ''));

      return JSON.stringify(
        indices.map((idx) => ({
          item_id: idx,
          title: `[STUB] Headline for item ${idx}`,
          analysis: `[STUB] No AI API key configured. This is placeholder analysis for item ${idx}.`,
        })),
      );
    }

    return '{}';
  }
}
