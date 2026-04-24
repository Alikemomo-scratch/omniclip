# Digest Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing map-reduce digest pipeline with a two-phase screen+deep-dive pipeline, expose the digest prompt as a user-customizable setting, and render the new headlines+categories output structure in the frontend.

**Architecture:** The new pipeline splits into pure-function units (ContentFormatter, PromptSplitter, ResponseValidator) and executor units (Phase1Executor, Phase2Executor) orchestrated by DigestPipeline. A new `digest_prompt` column on the `users` table allows per-user prompt customization. The frontend detects old vs. new digest shapes by checking for a `headlines` key in `topic_groups`.

**Tech Stack:** TypeScript 5.x, Node.js 22 LTS, NestJS 10, Drizzle ORM, Vitest, React/Next.js, TanStack Query

**Spec:** `docs/superpowers/specs/2026-04-23-digest-pipeline-redesign.md`

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `packages/backend/drizzle/0003_add_digest_prompt.sql` | DB migration: add `digest_prompt` text column to `users` |
| `packages/backend/src/digest/prompts/digest.validators.ts` | `ResponseValidator` — validate LLM JSON, filter invalid item_ids |
| `packages/backend/test/unit/content-formatter.spec.ts` | Unit tests for ContentFormatter |
| `packages/backend/test/unit/prompt-splitter.spec.ts` | Unit tests for PromptSplitter |
| `packages/backend/test/unit/response-validator.spec.ts` | Unit tests for ResponseValidator |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/backend/src/common/database/schema/index.ts` (L18-34) | Add `digestPrompt` column to `users` table |
| `packages/backend/src/digest/prompts/digest.prompts.ts` (full rewrite) | Replace old prompt builders with ContentFormatter, PromptSplitter, default template, JSON schema strings, new types |
| `packages/backend/src/digest/digest.service.ts` (L1-573) | Rewrite pipeline: replace `generateSimpleDigest`/`generateMapReduceDigest` with Phase1Executor/Phase2Executor/DigestPipeline; update `completeDigest` for new shape |
| `packages/backend/src/users/users.service.ts` (L13-133) | Add `digestPrompt` to selects, update, formatUser |
| `packages/backend/src/users/dto/update-user.dto.ts` (L1-34) | Add `digest_prompt` field |
| `packages/backend/src/users/users.service.spec.ts` (L1-120) | Add `digestPrompt` to mock user + assertions |
| `packages/backend/test/unit/digest-prompts.spec.ts` (full rewrite) | Replace old prompt test suite with new tests for ContentFormatter + PromptSplitter |
| `packages/frontend/src/lib/api-client.ts` (L300-368) | Update `User`, `TopicGroup`, `Digest` types; add new interfaces |
| `packages/frontend/src/app/(dashboard)/settings/page.tsx` (L1-206) | Add prompt editor textarea + reset button |
| `packages/frontend/src/app/(dashboard)/digests/page.tsx` (L317-383) | Rewrite `DigestDetail` to render headlines + categories; keep `TopicGroupCard` for backward compat |

---

## Chunk 1: DB Migration + ContentFormatter + PromptSplitter

Pure foundation work — no LLM calls, no service changes. All functions are pure and fully unit-testable.

### Task 1.1: DB Migration — Add `digest_prompt` to Users

**Files:**
- Create: `packages/backend/drizzle/0003_add_digest_prompt.sql`
- Modify: `packages/backend/src/common/database/schema/index.ts:18-34`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- Add digest_prompt column to users table
ALTER TABLE users ADD COLUMN digest_prompt TEXT;
```

- [ ] **Step 2: Add `digestPrompt` to Drizzle schema**

In `packages/backend/src/common/database/schema/index.ts`, add inside the `users` table definition, after `contentRetentionDays` (line 29):

```typescript
digestPrompt: text('digest_prompt'),
```

- [ ] **Step 3: Verify schema compiles**

Run: `pnpm --filter backend typecheck`
Expected: No errors related to `digestPrompt`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/drizzle/0003_add_digest_prompt.sql packages/backend/src/common/database/schema/index.ts
git commit -m "feat(db): add digest_prompt column to users table"
```

---

### Task 1.2: New Types for the Two-Phase Pipeline

**Files:**
- Modify: `packages/backend/src/digest/prompts/digest.prompts.ts:10-39`

- [ ] **Step 1: Define new types at the top of `digest.prompts.ts`**

Keep the existing `ContentItemForDigest` interface (lines 10-20) unchanged — it's used by `fetchContentForPeriod` and the new pipeline.

Replace `ItemSummary`, `TopicGroup`, and `DigestResult` (lines 22-39) with the new types:

```typescript
// ── Phase 1 output types ──

export interface Phase1Headline {
  item_id: string;
  topic: string;
}

export interface Phase1CategoryItem {
  item_id: string;
  one_liner: string;
}

export interface Phase1Category {
  topic: string;
  items: Phase1CategoryItem[];
}

export interface Phase1Result {
  headlines: Phase1Headline[];
  categories: Phase1Category[];
  trend_analysis: string;
}

// ── Phase 2 output types ──

export interface Phase2HeadlineResult {
  item_id: string;
  title: string;
  analysis: string;
}

// ── Final merged output ──

export interface DigestHeadline {
  item_id: string;
  topic: string;
  title: string;
  analysis: string;
  platform: string;
  original_url: string;
}

export interface DigestCategoryItem {
  item_id: string;
  one_liner: string;
  platform: string;
  original_url: string;
}

export interface DigestCategory {
  topic: string;
  items: DigestCategoryItem[];
}

export interface DigestOutput {
  headlines: DigestHeadline[];
  categories: DigestCategory[];
  trend_analysis: string;
}

// Keep for backward compatibility — used by completeDigest
export interface DigestResult {
  topic_groups: DigestOutput | Record<string, unknown>[];
  trend_analysis: string;
  item_count: number;
}
```

- [ ] **Step 2: Remove old types that are no longer needed**

Delete `ItemSummary` (lines 22-26) and `TopicGroup` (lines 28-33) interfaces. These are replaced by the new types above. Keep `DigestResult` but update its `topic_groups` type as shown above.

- [ ] **Step 3: Verify compilation**

Run: `pnpm --filter backend typecheck`
Expected: There will be compilation errors in `digest.service.ts` (references to old types) — this is expected and will be fixed in Chunk 3.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/digest/prompts/digest.prompts.ts
git commit -m "feat(digest): define new two-phase pipeline type system"
```

---

### Task 1.3: ContentFormatter — Pure Function

**Files:**
- Modify: `packages/backend/src/digest/prompts/digest.prompts.ts` (add new function)
- Create: `packages/backend/test/unit/content-formatter.spec.ts`

The `ContentFormatter` converts content items to standardized text blocks per the spec format:
```
[{index}] id:{id} | {platform}/{content_type} | {published_at}
  Title: {title}
  Author: {author_name}
  Content: {body}
  URL: {original_url}
  Metrics: {key metrics from metadata}
```

**Null-field policy**: Fields with null/falsy values are intentionally omitted from the block. The spec format shows all fields as a template, but null fields provide no useful signal to the LLM and would create noise (e.g., "Title: " with no value). This is a deliberate design choice aligned with the spec's intent of standardized formatting.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/test/unit/content-formatter.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatContentItems,
  extractMetrics,
  type ContentItemForDigest,
} from '../../src/digest/prompts/digest.prompts';

function buildItem(overrides: Partial<ContentItemForDigest> = {}): ContentItemForDigest {
  return {
    id: 'item-001',
    platform: 'github',
    content_type: 'release',
    title: 'v1.0.0 Released',
    body: 'Major release with new features.',
    author_name: 'dev-user',
    original_url: 'https://github.com/repo/releases/v1.0.0',
    published_at: '2026-03-10T08:00:00Z',
    metadata: {},
    ...overrides,
  };
}

describe('extractMetrics', () => {
  it('extracts Twitter metrics', () => {
    const result = extractMetrics('twitter', {
      likeCount: 100,
      retweetCount: 50,
      replyCount: 10,
      views: 5000,
    });
    expect(result).toBe('likes: 100, retweets: 50, replies: 10, views: 5000');
  });

  it('extracts GitHub metrics', () => {
    const result = extractMetrics('github', {
      stars: 1234,
      forks: 56,
      language: 'TypeScript',
      tags: ['v1.0', 'stable'],
    });
    expect(result).toBe('stars: 1234, forks: 56, language: TypeScript, tags: v1.0, stable');
  });

  it('extracts YouTube metrics', () => {
    const result = extractMetrics('youtube', {
      view_count: 50000,
      like_count: 1200,
      duration: 'PT15M30S',
    });
    expect(result).toBe('views: 50000, likes: 1200, duration: PT15M30S');
  });

  it('returns empty string for unknown platform with no recognized keys', () => {
    const result = extractMetrics('unknown', { foo: 'bar' });
    expect(result).toBe('');
  });

  it('returns empty string for empty metadata', () => {
    const result = extractMetrics('github', {});
    expect(result).toBe('');
  });

  it('does not leak Twitter metrics for GitHub items', () => {
    const result = extractMetrics('github', { likeCount: 100, retweetCount: 50, stars: 200 });
    expect(result).toBe('stars: 200');
    expect(result).not.toContain('likes');
    expect(result).not.toContain('retweets');
  });

  it('does not leak GitHub metrics for Twitter items', () => {
    const result = extractMetrics('twitter', { stars: 500, likeCount: 100 });
    expect(result).toBe('likes: 100');
    expect(result).not.toContain('stars');
  });
});

describe('formatContentItems', () => {
  it('formats a single item with all fields', () => {
    const items = [buildItem()];
    const result = formatContentItems(items, 500);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('[1] id:item-001 | github/release | 2026-03-10T08:00:00Z');
    expect(result[0]).toContain('Title: v1.0.0 Released');
    expect(result[0]).toContain('Author: dev-user');
    expect(result[0]).toContain('Content: Major release with new features.');
    expect(result[0]).toContain('URL: https://github.com/repo/releases/v1.0.0');
  });

  it('truncates body to maxBodyLength', () => {
    const longBody = 'x'.repeat(1000);
    const items = [buildItem({ body: longBody })];
    const result = formatContentItems(items, 500);

    expect(result[0]).toContain('x'.repeat(497) + '...');
    expect(result[0]).not.toContain('x'.repeat(498));
  });

  it('does not truncate body shorter than maxBodyLength', () => {
    const items = [buildItem({ body: 'short body' })];
    const result = formatContentItems(items, 500);

    expect(result[0]).toContain('Content: short body');
    expect(result[0]).not.toContain('...');
  });

  it('omits Title line when title is null', () => {
    const items = [buildItem({ title: null })];
    const result = formatContentItems(items, 500);

    expect(result[0]).not.toContain('Title:');
  });

  it('omits Author line when author_name is null', () => {
    const items = [buildItem({ author_name: null })];
    const result = formatContentItems(items, 500);

    expect(result[0]).not.toContain('Author:');
  });

  it('omits Content line when body is null', () => {
    const items = [buildItem({ body: null })];
    const result = formatContentItems(items, 500);

    expect(result[0]).not.toContain('Content:');
  });

  it('omits Metrics line when metadata yields empty metrics', () => {
    const items = [buildItem({ metadata: {} })];
    const result = formatContentItems(items, 500);

    expect(result[0]).not.toContain('Metrics:');
  });

  it('includes Metrics line when metadata has recognized keys', () => {
    const items = [buildItem({ platform: 'github', metadata: { stars: 500 } })];
    const result = formatContentItems(items, 500);

    expect(result[0]).toContain('Metrics: stars: 500');
  });

  it('formats multiple items with correct indices', () => {
    const items = [
      buildItem({ id: 'a1', title: 'First' }),
      buildItem({ id: 'a2', title: 'Second' }),
      buildItem({ id: 'a3', title: 'Third' }),
    ];
    const result = formatContentItems(items, 500);

    expect(result).toHaveLength(3);
    expect(result[0]).toContain('[1] id:a1');
    expect(result[1]).toContain('[2] id:a2');
    expect(result[2]).toContain('[3] id:a3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend vitest run test/unit/content-formatter.spec.ts`
Expected: FAIL — `formatContentItems` and `extractMetrics` are not exported.

- [ ] **Step 3: Implement `extractMetrics` and `formatContentItems`**

Add to `packages/backend/src/digest/prompts/digest.prompts.ts`:

```typescript
// ── ContentFormatter ──

/**
 * Extract platform-specific metrics from metadata into a human-readable string.
 */
export function extractMetrics(platform: string, metadata: Record<string, unknown>): string {
  const parts: string[] = [];

  switch (platform) {
    case 'twitter':
    case 'x':
      if ('likeCount' in metadata) parts.push(`likes: ${metadata.likeCount}`);
      if ('retweetCount' in metadata) parts.push(`retweets: ${metadata.retweetCount}`);
      if ('replyCount' in metadata) parts.push(`replies: ${metadata.replyCount}`);
      if ('views' in metadata) parts.push(`views: ${metadata.views}`);
      break;

    case 'github':
      if ('stars' in metadata) parts.push(`stars: ${metadata.stars}`);
      if ('forks' in metadata) parts.push(`forks: ${metadata.forks}`);
      if ('language' in metadata) parts.push(`language: ${metadata.language}`);
      if ('tags' in metadata) parts.push(`tags: ${(metadata.tags as string[]).join(', ')}`);
      break;

    case 'youtube':
      if ('view_count' in metadata) parts.push(`views: ${metadata.view_count}`);
      if ('like_count' in metadata) parts.push(`likes: ${metadata.like_count}`);
      if ('duration' in metadata) parts.push(`duration: ${metadata.duration}`);
      break;

    default:
      // Generic fallback — check for common metric keys
      if ('likes' in metadata) parts.push(`likes: ${metadata.likes}`);
      if ('views' in metadata) parts.push(`views: ${metadata.views}`);
      break;
  }

  return parts.join(', ');
}

/**
 * Format content items into standardized text blocks for LLM consumption.
 * Each item becomes a multi-line text block with header and indented fields.
 */
export function formatContentItems(
  items: ContentItemForDigest[],
  maxBodyLength: number,
): string[] {
  return items.map((item, index) => {
    const lines: string[] = [];

    // Header line
    lines.push(
      `[${index + 1}] id:${item.id} | ${item.platform}/${item.content_type} | ${item.published_at}`,
    );

    // Optional fields
    if (item.title) lines.push(`  Title: ${item.title}`);
    if (item.author_name) lines.push(`  Author: ${item.author_name}`);
    if (item.body) {
      const truncated =
        item.body.length > maxBodyLength
          ? item.body.slice(0, maxBodyLength - 3) + '...'
          : item.body;
      lines.push(`  Content: ${truncated}`);
    }
    lines.push(`  URL: ${item.original_url}`);

    // Metrics
    const metrics = extractMetrics(item.platform, item.metadata);
    if (metrics) lines.push(`  Metrics: ${metrics}`);

    return lines.join('\n');
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend vitest run test/unit/content-formatter.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/digest/prompts/digest.prompts.ts packages/backend/test/unit/content-formatter.spec.ts
git commit -m "feat(digest): implement ContentFormatter with standardized text block output"
```

---

### Task 1.4: PromptSplitter — Pure Function

**Files:**
- Modify: `packages/backend/src/digest/prompts/digest.prompts.ts` (add new function + default template)
- Create: `packages/backend/test/unit/prompt-splitter.spec.ts`

The `PromptSplitter` splits user template by `---PHASE_SEPARATOR---` and falls back to system defaults per the spec rules.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/test/unit/prompt-splitter.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  splitPromptTemplate,
  DEFAULT_PHASE1_PROMPT,
  DEFAULT_PHASE2_PROMPT,
} from '../../src/digest/prompts/digest.prompts';

describe('splitPromptTemplate', () => {
  it('splits on ---PHASE_SEPARATOR--- into two phases', () => {
    const template = 'Phase 1 instructions\n---PHASE_SEPARATOR---\nPhase 2 instructions';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 instructions');
    expect(result.phase2).toBe('Phase 2 instructions');
  });

  it('trims whitespace around each phase', () => {
    const template = '  Phase 1 with spaces  \n---PHASE_SEPARATOR---\n  Phase 2 with spaces  ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 with spaces');
    expect(result.phase2).toBe('Phase 2 with spaces');
  });

  it('uses entire prompt as Phase 1 and default for Phase 2 when no separator', () => {
    const template = 'Only Phase 1 content here';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Only Phase 1 content here');
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is null', () => {
    const result = splitPromptTemplate(null);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is undefined', () => {
    const result = splitPromptTemplate(undefined);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is empty string', () => {
    const result = splitPromptTemplate('');

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both phases when input is whitespace-only', () => {
    const result = splitPromptTemplate('   \n  \t  ');

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('splits on first occurrence only — second separator is part of Phase 2', () => {
    const template = 'Phase 1\n---PHASE_SEPARATOR---\nPhase 2 part A\n---PHASE_SEPARATOR---\nPhase 2 part B';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1');
    expect(result.phase2).toBe('Phase 2 part A\n---PHASE_SEPARATOR---\nPhase 2 part B');
  });

  it('uses default Phase 1 when text before separator is empty after trim', () => {
    const template = '   \n---PHASE_SEPARATOR---\nPhase 2 content';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe('Phase 2 content');
  });

  it('uses default Phase 2 when text after separator is empty after trim', () => {
    const template = 'Phase 1 content\n---PHASE_SEPARATOR---\n   ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe('Phase 1 content');
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });

  it('uses defaults for both when separator exists but both sides are empty', () => {
    const template = '  \n---PHASE_SEPARATOR---\n  ';
    const result = splitPromptTemplate(template);

    expect(result.phase1).toBe(DEFAULT_PHASE1_PROMPT);
    expect(result.phase2).toBe(DEFAULT_PHASE2_PROMPT);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend vitest run test/unit/prompt-splitter.spec.ts`
Expected: FAIL — `splitPromptTemplate`, `DEFAULT_PHASE1_PROMPT`, `DEFAULT_PHASE2_PROMPT` not exported.

- [ ] **Step 3: Implement `splitPromptTemplate` and default prompts**

Add to `packages/backend/src/digest/prompts/digest.prompts.ts`:

```typescript
// ── Default Prompt Templates ──

const PHASE_SEPARATOR = '---PHASE_SEPARATOR---';

export const DEFAULT_PHASE1_PROMPT = `You are a tech content curator. Classify the following content by topic and select the 3-5 most important items as headlines.

Importance criteria:
- Major releases or breakthroughs in AI/LLM
- Widely impactful technical changes
- Significant product launches

For non-headline items, write a one-liner summary each.`;

export const DEFAULT_PHASE2_PROMPT = `You are a senior tech journalist. Write detailed analysis for each important item in newspaper headline style:
- What is it and why it matters
- Impact on the industry/developers
- Key technical details`;

// ── JSON Schema Strings (appended by system to LLM prompts) ──

export const PHASE1_JSON_SCHEMA = `Respond in this exact JSON format (no markdown, no code fences):
{
  "headlines": [{ "item_id": "uuid-string", "topic": "Topic Name" }],
  "categories": [{ "topic": "Topic Name", "items": [{ "item_id": "uuid-string", "one_liner": "One sentence summary" }] }],
  "trend_analysis": "Cross-platform trend analysis paragraph"
}`;

export const PHASE2_JSON_SCHEMA = `Respond in this exact JSON format (no markdown, no code fences):
[{ "item_id": "uuid-string", "title": "Headline Title", "analysis": "Detailed newspaper-style analysis paragraph" }]`;

// ── PromptSplitter ──

export interface SplitPromptResult {
  phase1: string;
  phase2: string;
}

/**
 * Split a user prompt template by ---PHASE_SEPARATOR---.
 *
 * Rules (from spec):
 * - Input is trimmed. If empty → use defaults for both phases.
 * - Split on FIRST occurrence of ---PHASE_SEPARATOR---.
 * - If no separator → entire prompt is Phase 1, Phase 2 uses default.
 * - Each phase trimmed independently. If empty after trim → use default.
 */
export function splitPromptTemplate(
  template: string | null | undefined,
): SplitPromptResult {
  const trimmed = (template ?? '').trim();

  if (!trimmed) {
    return { phase1: DEFAULT_PHASE1_PROMPT, phase2: DEFAULT_PHASE2_PROMPT };
  }

  const separatorIndex = trimmed.indexOf(PHASE_SEPARATOR);

  if (separatorIndex === -1) {
    // No separator — entire prompt is Phase 1
    return { phase1: trimmed, phase2: DEFAULT_PHASE2_PROMPT };
  }

  const phase1Raw = trimmed.slice(0, separatorIndex).trim();
  const phase2Raw = trimmed.slice(separatorIndex + PHASE_SEPARATOR.length).trim();

  return {
    phase1: phase1Raw || DEFAULT_PHASE1_PROMPT,
    phase2: phase2Raw || DEFAULT_PHASE2_PROMPT,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend vitest run test/unit/prompt-splitter.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/digest/prompts/digest.prompts.ts packages/backend/test/unit/prompt-splitter.spec.ts
git commit -m "feat(digest): implement PromptSplitter with default templates and JSON schemas"
```

---

### Task 1.5: Remove Old Prompt Builders

**Files:**
- Modify: `packages/backend/src/digest/prompts/digest.prompts.ts`
- Modify: `packages/backend/test/unit/digest-prompts.spec.ts` (full rewrite)

Now that the new functions exist, remove the old ones that the new pipeline won't use. Keep `batchItems` — it's a generic utility.

- [ ] **Step 1: Remove old functions from `digest.prompts.ts`**

Delete these functions (they'll be replaced by the new pipeline):
- `buildMapPrompt` (lines 44-74)
- `buildReducePrompt` (lines 79-110)
- `buildSimpleSummaryPrompt` (lines 115-145)
- `buildBatchMapPrompt` (lines 162-187)

Keep `batchItems` (lines 151-157) — still useful for generic batching if needed.

Also remove old type exports that no longer exist: `ItemSummary`, `TopicGroup`.

- [ ] **Step 2: Rewrite `test/unit/digest-prompts.spec.ts`**

Replace the full content of `packages/backend/test/unit/digest-prompts.spec.ts` with only the `batchItems` tests (the only surviving old function):

```typescript
import { describe, it, expect } from 'vitest';
import { batchItems } from '../../src/digest/prompts/digest.prompts';

describe('batchItems', () => {
  it('splits items into batches of the given size', () => {
    const items = [1, 2, 3, 4, 5];
    const batches = batchItems(items, 2);
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single batch when items <= batchSize', () => {
    const items = [1, 2, 3];
    const batches = batchItems(items, 5);
    expect(batches).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    const batches = batchItems([], 3);
    expect(batches).toEqual([]);
  });

  it('handles batchSize of 1', () => {
    const items = ['a', 'b', 'c'];
    const batches = batchItems(items, 1);
    expect(batches).toEqual([['a'], ['b'], ['c']]);
  });
});
```

- [ ] **Step 3: Run all unit tests to verify nothing is broken**

Run: `pnpm --filter backend vitest run test/unit/`
Expected: All tests PASS. (The `digest.service.ts` will have compile errors but unit tests don't import it.)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/digest/prompts/digest.prompts.ts packages/backend/test/unit/digest-prompts.spec.ts
git commit -m "refactor(digest): remove old map-reduce prompt builders, keep batchItems"
```

---

## Chunk 2: ResponseValidator + Phase Executors

### Task 2.1: ResponseValidator — Pure Function

**Files:**
- Create: `packages/backend/src/digest/prompts/digest.validators.ts`
- Create: `packages/backend/test/unit/response-validator.spec.ts`

The `ResponseValidator` validates LLM JSON responses, checks required keys/types, and filters invalid `item_id` values.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/test/unit/response-validator.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validatePhase1Response,
  validatePhase2Response,
  deduplicatePhase1Result,
} from '../../src/digest/prompts/digest.validators';

describe('validatePhase1Response', () => {
  const validIds = new Set(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);

  it('accepts valid Phase 1 response and returns parsed result', () => {
    const json = JSON.stringify({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [{ topic: 'Tools', items: [{ item_id: 'id-2', one_liner: 'A tool update' }] }],
      trend_analysis: 'AI is trending.',
    });

    const result = validatePhase1Response(json, validIds);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
      expect(result.value.headlines[0].item_id).toBe('id-1');
      expect(result.value.categories).toHaveLength(1);
      expect(result.value.trend_analysis).toBe('AI is trending.');
    }
  });

  it('filters out headlines with unknown item_ids', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: 'id-1', topic: 'AI' },
        { item_id: 'unknown-id', topic: 'Bad' },
      ],
      categories: [],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
      expect(result.value.headlines[0].item_id).toBe('id-1');
    }
  });

  it('filters out category items with unknown item_ids', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [{ topic: 'Tools', items: [
        { item_id: 'id-2', one_liner: 'Valid' },
        { item_id: 'ghost', one_liner: 'Invalid' },
      ] }],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories[0].items).toHaveLength(1);
      expect(result.value.categories[0].items[0].item_id).toBe('id-2');
    }
  });

  it('removes empty categories after filtering', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [{ topic: 'Empty', items: [{ item_id: 'ghost', one_liner: 'Invalid' }] }],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories).toHaveLength(0);
    }
  });

  it('caps headlines at 10', () => {
    const headlines = Array.from({ length: 15 }, (_, i) => ({
      item_id: `id-${i + 1}`,
      topic: `Topic ${i + 1}`,
    }));
    // Need more valid IDs for this test
    const manyIds = new Set(headlines.map(h => h.item_id));

    const json = JSON.stringify({
      headlines,
      categories: [],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, manyIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(10);
      expect(result.droppedHeadlineCount).toBe(5);
    }
  });

  it('returns error for invalid JSON', () => {
    const result = validatePhase1Response('not json', validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when headlines is not an array', () => {
    const json = JSON.stringify({
      headlines: 'not an array',
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when categories is not an array', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: 'not an array',
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when trend_analysis is missing', () => {
    const json = JSON.stringify({ headlines: [], categories: [] });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('filters headline items with empty item_id', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: '', topic: 'Empty ID' },
        { item_id: 'id-1', topic: 'Valid' },
      ],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
    }
  });

  it('accepts empty arrays as valid', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
  });

  it('deduplicates item_ids within headlines array (keeps first occurrence)', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: 'id-1', topic: 'AI' },
        { item_id: 'id-1', topic: 'AI duplicate' },
        { item_id: 'id-2', topic: 'Tools' },
      ],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(2);
      expect(result.value.headlines[0].topic).toBe('AI');
      expect(result.value.headlines[1].topic).toBe('Tools');
    }
  });
});

describe('validatePhase2Response', () => {
  const validHeadlineIds = new Set(['h-1', 'h-2', 'h-3']);

  it('accepts valid Phase 2 response', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Breaking: AI', analysis: 'Detailed analysis...' },
      { item_id: 'h-2', title: 'New Framework', analysis: 'Another analysis...' },
    ]);

    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('filters out items with unknown item_ids', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'unknown', title: 'Invalid', analysis: 'Bad' },
    ]);

    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('returns error for invalid JSON', () => {
    const result = validatePhase2Response('bad json', validHeadlineIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when response is not an array', () => {
    const json = JSON.stringify({ item_id: 'h-1', title: 'Not array', analysis: 'Bad' });
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(false);
  });

  it('filters items with missing title or analysis', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'h-2', title: '', analysis: 'Missing title' },
      { item_id: 'h-3', analysis: 'Missing title key' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('accepts empty array as valid', () => {
    const json = JSON.stringify([]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('filters items with empty analysis', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'h-2', title: 'Also Valid', analysis: '' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('deduplicates item_ids (first occurrence wins)', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'First', analysis: 'Analysis 1' },
      { item_id: 'h-1', title: 'Duplicate', analysis: 'Analysis 2' },
      { item_id: 'h-2', title: 'Second', analysis: 'Analysis 3' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].title).toBe('First');
      expect(result.value[1].item_id).toBe('h-2');
    }
  });
});

describe('deduplicatePhase1Result', () => {
  it('removes category items that appear in headlines', () => {
    const result = deduplicatePhase1Result({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [
        { topic: 'AI', items: [
          { item_id: 'id-1', one_liner: 'Dupe' },
          { item_id: 'id-2', one_liner: 'Unique' },
        ] },
      ],
      trend_analysis: '',
    });

    expect(result.categories[0].items).toHaveLength(1);
    expect(result.categories[0].items[0].item_id).toBe('id-2');
  });

  it('removes empty categories after dedup', () => {
    const result = deduplicatePhase1Result({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [
        { topic: 'AI', items: [{ item_id: 'id-1', one_liner: 'Only dupe' }] },
      ],
      trend_analysis: '',
    });

    expect(result.categories).toHaveLength(0);
  });

  it('within categories, keeps first occurrence of duplicate item_id', () => {
    const result = deduplicatePhase1Result({
      headlines: [],
      categories: [
        { topic: 'A', items: [{ item_id: 'id-1', one_liner: 'First' }] },
        { topic: 'B', items: [{ item_id: 'id-1', one_liner: 'Second' }] },
      ],
      trend_analysis: '',
    });

    // id-1 should only appear in topic A (first occurrence)
    const allItemIds = result.categories.flatMap(c => c.items.map(i => i.item_id));
    expect(allItemIds.filter(id => id === 'id-1')).toHaveLength(1);
    expect(result.categories.find(c => c.topic === 'A')?.items[0].item_id).toBe('id-1');
  });

  it('does not modify headlines', () => {
    const result = deduplicatePhase1Result({
      headlines: [
        { item_id: 'id-1', topic: 'A' },
        { item_id: 'id-2', topic: 'B' },
      ],
      categories: [],
      trend_analysis: 'test',
    });

    expect(result.headlines).toHaveLength(2);
    expect(result.trend_analysis).toBe('test');
  });

  it('excludes ALL pre-cap headline IDs from categories (R2-8)', () => {
    // Simulate: LLM returned 12 headlines, validator capped to 10.
    // Items 11 and 12 were dropped from headlines but might appear in categories.
    // allHeadlineIds preserves all 12 IDs so dedup excludes them from categories.
    const allHeadlineIds = Array.from({ length: 12 }, (_, i) => `id-${i + 1}`);
    const cappedResult = {
      headlines: allHeadlineIds.slice(0, 10).map(id => ({ item_id: id, topic: 'Topic' })),
      categories: [{
        topic: 'Misc',
        items: [
          { item_id: 'id-11', one_liner: 'Leaked headline 11' },
          { item_id: 'id-12', one_liner: 'Leaked headline 12' },
          { item_id: 'cat-1', one_liner: 'Genuine category item' },
        ],
      }],
      trend_analysis: '',
    };

    const deduped = deduplicatePhase1Result(cappedResult, allHeadlineIds);
    const categoryItemIds = deduped.categories.flatMap(c => c.items.map(i => i.item_id));
    expect(categoryItemIds).not.toContain('id-11');
    expect(categoryItemIds).not.toContain('id-12');
    expect(categoryItemIds).toContain('cat-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend vitest run test/unit/response-validator.spec.ts`
Expected: FAIL — functions not found.

- [ ] **Step 3: Implement ResponseValidator**

Create `packages/backend/src/digest/prompts/digest.validators.ts`:

```typescript
import type {
  Phase1Result,
  Phase1Headline,
  Phase1Category,
  Phase1CategoryItem,
  Phase2HeadlineResult,
} from './digest.prompts';

const MAX_HEADLINES = 10;

export type ValidationResult<T> =
  | { ok: true; value: T; droppedHeadlineCount?: number; allHeadlineIds?: string[] }
  | { ok: false; error: string };

/**
 * Parse raw JSON string, stripping markdown fences if present.
 */
function parseJson(raw: string): unknown | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate and sanitize Phase 1 LLM response.
 * - Checks required keys and types
 * - Filters invalid/unknown item_ids
 * - Caps headlines at MAX_HEADLINES
 */
export function validatePhase1Response(
  raw: string,
  validIds: Set<string>,
): ValidationResult<Phase1Result> {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Failed to parse Phase 1 response as JSON' };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.headlines)) {
    return { ok: false, error: 'Phase 1: headlines is not an array' };
  }
  if (!Array.isArray(obj.categories)) {
    return { ok: false, error: 'Phase 1: categories is not an array' };
  }
  if (typeof obj.trend_analysis !== 'string') {
    return { ok: false, error: 'Phase 1: trend_analysis is missing or not a string' };
  }

  // Filter and validate headlines (deduplicate item_ids — first occurrence wins)
  const seenHeadlineIds = new Set<string>();
  const filteredHeadlines: Phase1Headline[] = (obj.headlines as Record<string, unknown>[])
    .filter(
      (h) =>
        typeof h.item_id === 'string' &&
        h.item_id.length > 0 &&
        typeof h.topic === 'string' &&
        validIds.has(h.item_id),
    )
    .filter((h) => {
      if (seenHeadlineIds.has(h.item_id as string)) return false;
      seenHeadlineIds.add(h.item_id as string);
      return true;
    })
    .map((h) => ({ item_id: h.item_id as string, topic: h.topic as string }));

  const droppedHeadlineCount = Math.max(0, filteredHeadlines.length - MAX_HEADLINES);
  const headlines = filteredHeadlines.slice(0, MAX_HEADLINES);

  // Filter and validate categories
  const categories: Phase1Category[] = (obj.categories as Record<string, unknown>[])
    .filter(
      (c) => typeof c.topic === 'string' && Array.isArray(c.items),
    )
    .map((c) => ({
      topic: c.topic as string,
      items: (c.items as Record<string, unknown>[])
        .filter(
          (item) =>
            typeof item.item_id === 'string' &&
            item.item_id.length > 0 &&
            typeof item.one_liner === 'string' &&
            validIds.has(item.item_id as string),
        )
        .map((item) => ({
          item_id: item.item_id as string,
          one_liner: item.one_liner as string,
        })),
    }))
    .filter((c) => c.items.length > 0);

  return {
    ok: true,
    value: {
      headlines,
      categories,
      trend_analysis: obj.trend_analysis as string,
    },
    droppedHeadlineCount,
    allHeadlineIds: filteredHeadlines.map(h => h.item_id),
  };
}

/**
 * Validate and sanitize Phase 2 LLM response.
 * - Checks it's an array of objects with item_id, title, analysis
 * - Filters unknown item_ids
 */
export function validatePhase2Response(
  raw: string,
  validHeadlineIds: Set<string>,
): ValidationResult<Phase2HeadlineResult[]> {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Phase 2: response is not a JSON array' };
  }

  const seenIds = new Set<string>();
  const results: Phase2HeadlineResult[] = (parsed as Record<string, unknown>[])
    .filter(
      (item) =>
        typeof item.item_id === 'string' &&
        item.item_id.length > 0 &&
        typeof item.title === 'string' &&
        item.title.length > 0 &&
        typeof item.analysis === 'string' &&
        (item.analysis as string).length > 0 &&
        validHeadlineIds.has(item.item_id as string),
    )
    .filter((item) => {
      if (seenIds.has(item.item_id as string)) return false;
      seenIds.add(item.item_id as string);
      return true;
    })
    .map((item) => ({
      item_id: item.item_id as string,
      title: item.title as string,
      analysis: item.analysis as string,
    }));

  return { ok: true, value: results };
}

/**
 * Deduplicate Phase 1 results per spec rules:
 * - Headlines take precedence over categories
 * - Within categories, first occurrence wins
 */
export function deduplicatePhase1Result(result: Phase1Result, allHeadlineIds?: string[]): Phase1Result {
  const headlineIds = new Set(allHeadlineIds ?? result.headlines.map((h) => h.item_id));
  const seenInCategories = new Set<string>();

  const categories: Phase1Category[] = result.categories
    .map((cat) => ({
      topic: cat.topic,
      items: cat.items.filter((item) => {
        if (headlineIds.has(item.item_id)) return false;
        if (seenInCategories.has(item.item_id)) return false;
        seenInCategories.add(item.item_id);
        return true;
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  return {
    headlines: result.headlines,
    categories,
    trend_analysis: result.trend_analysis,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend vitest run test/unit/response-validator.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/digest/prompts/digest.validators.ts packages/backend/test/unit/response-validator.spec.ts
git commit -m "feat(digest): implement ResponseValidator with Phase 1/2 validation and dedup"
```

---

## Chunk 3: DigestPipeline Orchestration

Rewrite `digest.service.ts` to use the new two-phase pipeline. This is the largest change.

### Task 3.1: Rewrite `digest.service.ts` Imports and Add Helpers

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts:1-21`

- [ ] **Step 1: Update imports**

Replace the existing imports (lines 11-20) with:

```typescript
import {
  formatContentItems,
  splitPromptTemplate,
  DEFAULT_PHASE1_PROMPT,
  DEFAULT_PHASE2_PROMPT,
  PHASE1_JSON_SCHEMA,
  PHASE2_JSON_SCHEMA,
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
```

- [ ] **Step 2: Verify it compiles (it won't yet — methods still reference old functions)**

This is expected; we'll fix the methods in the next tasks.

- [ ] **Step 3: Commit partial progress**

```bash
git add packages/backend/src/digest/digest.service.ts
git commit -m "refactor(digest): update digest.service.ts imports for two-phase pipeline"
```

---

### Task 3.2: Rewrite `generateDigest` Method

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts:56-132`

- [ ] **Step 1: Rewrite `generateDigest` method**

Replace the `generateDigest` method (lines 56-132) with:

```typescript
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

      // 4. Fetch user's digest_prompt
      const userPrompt = await this.fetchUserDigestPrompt(userId);
      const { phase1: phase1Prompt, phase2: phase2Prompt } = splitPromptTemplate(userPrompt);

      // 5. Build source data lookup map
      const sourceMap = new Map(items.map((item) => [item.id, item]));
      const validIds = new Set(items.map((item) => item.id));

      // 6. Phase 1: Screen & Classify (500 char body)
      onProgress?.({
        type: 'progress',
        data: { stage: 'screening', progress: 0.2 },
      });

      const phase1Result = await this.executePhase1(
        phase1Prompt,
        items,
        validIds,
        language,
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
```

- [ ] **Step 2: Add `fetchUserDigestPrompt` helper**

Add after the `linkDigestItems` method (around line 339):

```typescript
  private async fetchUserDigestPrompt(userId: string): Promise<string | null> {
    return withRlsContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({ digestPrompt: users.digestPrompt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row?.digestPrompt ?? null;
    });
  }
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/digest/digest.service.ts
git commit -m "refactor(digest): rewrite generateDigest for two-phase pipeline"
```

---

### Task 3.3: Implement Phase 1 Executor

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts`

- [ ] **Step 1: Add `executePhase1` method**

Add to `DigestService`:

```typescript
  /**
   * Phase 1: Screen & classify all content items.
   * Tries user prompt first, falls back to default on validation failure.
   * Returns null if transport fails (all retries exhausted) OR both prompts fail validation.
   */
  private async executePhase1(
    userPhase1Prompt: string,
    items: ContentItemForDigest[],
    validIds: Set<string>,
    language: string,
  ): Promise<Phase1Result | null> {
    const formattedItems = formatContentItems(items, 500);
    const contentBlock = formattedItems.join('\n\n');
    const langInstruction = this.buildLanguageInstruction(language);

    try {
      // Try user prompt
      const userFullPrompt = this.buildPhase1FullPrompt(userPhase1Prompt, langInstruction, contentBlock);
      const userResult = await this.tryPhase1(userFullPrompt, validIds);
      if (userResult) return userResult;

      // User prompt validation failed — retry with default
      this.logger.warn('Phase 1 user prompt failed validation, retrying with default prompt');
      const defaultFullPrompt = this.buildPhase1FullPrompt(DEFAULT_PHASE1_PROMPT, langInstruction, contentBlock);
      return this.tryPhase1(defaultFullPrompt, validIds);
    } catch (error) {
      // Transport exhaustion (all retries in callAIWithRetry failed) — phase fails
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
    validIds: Set<string>,
  ): Promise<Phase1Result | null> {
    // Transport errors from callAIWithRetry propagate to executePhase1
    const response = await this.callAIWithRetry(prompt);
    const validation = validatePhase1Response(response, validIds);
    if (!validation.ok) {
      // Schema/parse failure — return null to trigger default prompt fallback
      this.logger.warn(`Phase 1 validation failed: ${validation.error}`);
      return null;
    }
    // Log warning if headlines were capped (spec: headline cap warning)
    if (validation.droppedHeadlineCount && validation.droppedHeadlineCount > 0) {
      this.logger.warn(
        `Phase 1: ${validation.droppedHeadlineCount} headlines exceeded cap of 10, dropped`,
      );
    }
    return deduplicatePhase1Result(validation.value, validation.allHeadlineIds);
  }

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
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/digest/digest.service.ts
git commit -m "feat(digest): implement Phase1Executor with user+default prompt fallback"
```

---

### Task 3.4: Implement Phase 2 Executor

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts`

- [ ] **Step 1: Add `executePhase2` method**

Add to `DigestService`:

```typescript
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

    const formattedItems = formatContentItems(headlineItems, 3000);
    const contentBlock = formattedItems.join('\n\n');
    const langInstruction = this.buildLanguageInstruction(language);
    const validHeadlineIds = new Set(phase1Headlines.map((h) => h.item_id));

    // Build topic lookup
    const topicMap = new Map(phase1Headlines.map((h) => [h.item_id, h.topic]));

    let phase2Results: import('./prompts/digest.prompts').Phase2HeadlineResult[] | null = null;

    try {
      // Try user prompt
      const userFullPrompt = this.buildPhase2FullPrompt(userPhase2Prompt, langInstruction, contentBlock);
      phase2Results = await this.tryPhase2(userFullPrompt, validHeadlineIds);

      if (!phase2Results) {
        // User prompt validation failed — retry with default
        this.logger.warn('Phase 2 user prompt failed validation, retrying with default prompt');
        const defaultFullPrompt = this.buildPhase2FullPrompt(DEFAULT_PHASE2_PROMPT, langInstruction, contentBlock);
        phase2Results = await this.tryPhase2(defaultFullPrompt, validHeadlineIds);
      }
    } catch (error) {
      // Transport exhaustion (all retries in callAIWithRetry failed)
      this.logger.error(`Phase 2 transport failure after all retries: ${error}`);
      return [];
    }

    if (!phase2Results || phase2Results.length === 0) {
      // Phase 2 completely failed — return empty (digest still completes with categories only)
      this.logger.warn('Phase 2 completely failed — digest will have categories only');
      return [];
    }

    // Log missing headlines
    const returnedIds = new Set(phase2Results.map((r) => r.item_id));
    const missingIds = phase1Headlines
      .map((h) => h.item_id)
      .filter((id) => !returnedIds.has(id));
    if (missingIds.length > 0) {
      this.logger.warn(`Phase 2: ${missingIds.length} headlines missing analysis: ${missingIds.join(', ')}`);
    }

    // Merge: topic from Phase 1, title+analysis from Phase 2, platform+url from source
    return phase2Results.map((r) => {
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
    validHeadlineIds: Set<string>,
  ): Promise<import('./prompts/digest.prompts').Phase2HeadlineResult[] | null> {
    // Transport errors from callAIWithRetry propagate to executePhase2
    const response = await this.callAIWithRetry(prompt);
    const validation = validatePhase2Response(response, validHeadlineIds);
    if (!validation.ok) {
      // Schema/parse failure — return null to trigger default prompt fallback
      this.logger.warn(`Phase 2 validation failed: ${validation.error}`);
      return null;
    }
    return validation.value;
  }
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/digest/digest.service.ts
git commit -m "feat(digest): implement Phase2Executor with headline deep-dive and merge"
```

---

### Task 3.5: Restructure callAI, Remove Old Methods, and Update Stub

**Files:**
- Modify: `packages/backend/src/digest/digest.service.ts`

- [ ] **Step 1: Restructure `callAI` for retry-compatible error propagation (R2-2/R2-4)**

The current `callAI()` swallows Gemini/OpenAI transport errors and falls through to stub. This prevents `callAIWithRetry` from ever retrying. Additionally, OpenAI's `response_format: { type: 'json_object' }` forces a top-level JSON object, but Phase 2 requires a top-level JSON array.

Replace the existing `callAI` method (lines 478-516) with:

```typescript
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
```

**Key changes from current code:**
1. Gemini catch only falls through to OpenAI if OpenAI client exists — otherwise throws (enables retry)
2. OpenAI call has NO try-catch — transport errors propagate naturally (enables retry)
3. Removed `response_format: { type: 'json_object' }` from OpenAI — Phase 2 returns a JSON array, not object
4. Stub only returned when NO API keys configured (not after transport failures)

- [ ] **Step 2: Delete old pipeline methods**

Remove these methods entirely:
- `generateSimpleDigest` (old lines 382-404)
- `generateMapReduceDigest` (old lines 409-473)
- `parseJsonResponse` (old lines 560-572) — replaced by ResponseValidator

- [ ] **Step 3: Update `stubAIResponse` for new pipeline**

Replace the `stubAIResponse` method with:

```typescript
  /**
   * Stub response when no API key is configured.
   */
  private stubAIResponse(prompt: string): string {
    // Detect Phase 1 vs Phase 2 by checking for schema hints
    if (prompt.includes('"headlines"') && prompt.includes('"categories"')) {
      // Phase 1 stub — extract item IDs from content block
      const idMatches = prompt.match(/id:([a-f0-9-]+)/g) ?? [];
      const ids = idMatches.map((m) => m.replace('id:', ''));

      const headlines = ids.slice(0, 2).map((id) => ({ item_id: id, topic: 'General' }));
      const categoryItems = ids.slice(2).map((id) => ({
        item_id: id,
        one_liner: `Summary of item ${id}`,
      }));

      return JSON.stringify({
        headlines,
        categories: categoryItems.length > 0
          ? [{ topic: 'Other Updates', items: categoryItems }]
          : [],
        trend_analysis: 'Cross-platform analysis of recent content.',
      });
    }

    if (prompt.includes('"title"') && prompt.includes('"analysis"')) {
      // Phase 2 stub
      const idMatches = prompt.match(/id:([a-f0-9-]+)/g) ?? [];
      const ids = idMatches.map((m) => m.replace('id:', ''));

      return JSON.stringify(
        ids.map((id) => ({
          item_id: id,
          title: `Headline for ${id}`,
          analysis: `Detailed analysis of item ${id}.`,
        })),
      );
    }

    return '{}';
  }
```

- [ ] **Step 4: Update `completeDigest` to handle new shape**

The existing `completeDigest` method (lines 305-322) stores `result.topic_groups` into `topicGroups` JSONB. Since `DigestOutput` is an object (not an array), no change is needed — Drizzle serializes any JSON value. Just verify the types align.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter backend typecheck`
Expected: Clean (no type errors). If there are errors, fix them.

- [ ] **Step 6: Run all unit tests**

Run: `pnpm --filter backend vitest run test/unit/`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/digest/digest.service.ts
git commit -m "refactor(digest): restructure callAI for retry, remove old methods, update stub"
```

**Note on orchestration failure-matrix testing**: The spec defines a comprehensive failure matrix (spec lines 240-256) covering scenarios like Phase 1 user prompt fail → default fallback, Phase 2 partial results, transport retry exhaustion, etc. These scenarios require mocking `callAI` (a private method) and verifying multi-step orchestration flows. Unit testing at this level is deferred — the pure-function units (ContentFormatter, PromptSplitter, ResponseValidator) are fully tested, and the orchestration paths are exercised via the stub (`stubAIResponse` in Task 3.5) during integration testing. If confidence is needed before shipping, a dedicated integration test file (`test/integration/digest-pipeline.spec.ts`) can mock `callAI` via dependency injection, but this is not part of the current plan scope.

---

## Chunk 4: User Service + Settings Page (digest_prompt field)

### Task 4.1: Update User Service + DTO

**Files:**
- Modify: `packages/backend/src/users/dto/update-user.dto.ts`
- Modify: `packages/backend/src/users/users.service.ts`
- Modify: `packages/backend/src/users/users.service.spec.ts`

- [ ] **Step 1: Add `digest_prompt` to UpdateUserDto**

In `packages/backend/src/users/dto/update-user.dto.ts`, add after `content_retention_days` (line 33). Import `ValidateIf` from `class-validator` if not already imported. The field must accept `null` to support the "Reset to Default" flow where frontend sends `null`:

```typescript
  @IsOptional()
  @ValidateIf((o) => o.digest_prompt !== null)
  @IsString()
  @MaxLength(10000)
  digest_prompt?: string | null;
```

- [ ] **Step 2: Add `digestPrompt` to all select queries in `users.service.ts`**

In `findById` (line 16-27), add to the select object:
```typescript
          digestPrompt: users.digestPrompt,
```

In `update` method (line 59-70), add to returning:
```typescript
          digestPrompt: users.digestPrompt,
```

In `findByIdInTx` (lines 85-97), add to select:
```typescript
          digestPrompt: users.digestPrompt,
```

- [ ] **Step 3: Handle `digest_prompt` in update method**

In the `update` method, add after `contentRetentionDays` mapping (line 51). Note: `null` means "reset to default" — store it as `null` in DB:
```typescript
      if (dto.digest_prompt !== undefined) updateData.digestPrompt = dto.digest_prompt ?? null;
```

- [ ] **Step 4: Update `formatUser` to include `digest_prompt`**

Update the `formatUser` method signature (line 109) to include:
```typescript
    digestPrompt: string | null;
```

Add to the return object (line 121-132):
```typescript
      digest_prompt: user.digestPrompt,
```

- [ ] **Step 5: Update unit test**

In `packages/backend/src/users/users.service.spec.ts`, add `digestPrompt: null` to `mockUser` (line 42-53):
```typescript
  digestPrompt: null,
```

Add assertion in `findById` test (line 70-80):
```typescript
      expect(result.digest_prompt).toBeNull();
```

Add new test cases for digest_prompt update paths (after existing tests):
```typescript
  it('should update user digest_prompt', async () => {
    const customPrompt = 'My custom Phase 1\n---PHASE_SEPARATOR---\nMy Phase 2';
    mockDb.mockResolvedValueOnce([{ ...mockUser, digestPrompt: customPrompt }]);

    const result = await service.update('user-1', { digest_prompt: customPrompt });
    expect(result.digest_prompt).toBe(customPrompt);
  });

  it('should clear digest_prompt when set to null', async () => {
    mockDb.mockResolvedValueOnce([{ ...mockUser, digestPrompt: null }]);

    const result = await service.update('user-1', { digest_prompt: null });
    expect(result.digest_prompt).toBeNull();
  });
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter backend vitest run src/users/users.service.spec.ts`
Expected: All pass.

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter backend typecheck`
Expected: Clean.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/users/dto/update-user.dto.ts packages/backend/src/users/users.service.ts packages/backend/src/users/users.service.spec.ts
git commit -m "feat(users): add digest_prompt field to user service, DTO, and tests"
```

---

### Task 4.2: Update Frontend API Client Types

**Files:**
- Modify: `packages/frontend/src/lib/api-client.ts:300-368`

- [ ] **Step 1: Add `digest_prompt` to `User` interface**

In `packages/frontend/src/lib/api-client.ts`, update the `User` interface (lines 300-309):

```typescript
export interface User {
  id: string;
  email: string;
  display_name: string;
  preferred_language: string;
  digest_frequency: string;
  digest_time: string;
  timezone: string;
  content_retention_days: number;
  digest_prompt: string | null;
}
```

- [ ] **Step 2: Add new digest output types**

Add after the existing `TopicGroup` interface (line 354). **Do NOT re-declare `TopicGroup`** — it already exists. Only add the new interfaces:

```typescript
// New format (two-phase pipeline output)
export interface DigestHeadline {
  item_id: string;
  topic: string;
  title: string;
  analysis: string;
  platform: string;
  original_url: string;
}

export interface DigestCategoryItem {
  item_id: string;
  one_liner: string;
  platform: string;
  original_url: string;
}

export interface DigestCategory {
  topic: string;
  items: DigestCategoryItem[];
}

export interface DigestOutput {
  headlines: DigestHeadline[];
  categories: DigestCategory[];
  trend_analysis: string;
}
```

- [ ] **Step 3: Update `Digest` interface to support both shapes**

Update the `Digest` interface (lines 356-368):

```typescript
export interface Digest {
  id: string;
  digest_type: string;
  period_start: string;
  period_end: string;
  language: string;
  item_count: number;
  status: string;
  generated_at: string | null;
  topic_groups: DigestOutput | TopicGroup[];
  trend_analysis: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Add shape detection helper**

Add after the types:

```typescript
/** Check if topic_groups is in the new DigestOutput format */
export function isNewDigestFormat(topicGroups: DigestOutput | TopicGroup[]): topicGroups is DigestOutput {
  return topicGroups !== null && typeof topicGroups === 'object' && !Array.isArray(topicGroups) && 'headlines' in topicGroups;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/api-client.ts
git commit -m "feat(frontend): update API types for digest_prompt and new DigestOutput shape"
```

---

### Task 4.3: Settings Page — Prompt Editor

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add digest_prompt textarea to the form**

In `packages/frontend/src/app/(dashboard)/settings/page.tsx`, ensure `useState` and `useEffect` are imported (add `useEffect` if not already imported), and add state variables for the prompt:

After `const [error, setError] = useState('');` (line 11), add:
```typescript
  const [digestPrompt, setDigestPrompt] = useState<string | null>(null);
  const [promptInitialized, setPromptInitialized] = useState(false);
```

After the `useQuery` hook (line 16), add an effect to initialize the prompt state (**must use `useEffect` — do NOT call `setState` during render**):
```typescript
  // Initialize prompt from fetched user data
  useEffect(() => {
    if (user && !promptInitialized) {
      setDigestPrompt(user.digest_prompt);
      setPromptInitialized(true);
    }
  }, [user, promptInitialized]);
```

- [ ] **Step 2: Update `handleSubmit` to include `digest_prompt`**

Update the `handleSubmit` function (line 32-43) to include the prompt:

```typescript
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      display_name: formData.get('display_name') as string,
      preferred_language: formData.get('preferred_language') as string,
      digest_frequency: formData.get('digest_frequency') as string,
      digest_time: formData.get('digest_time') as string,
      timezone: formData.get('timezone') as string,
      content_retention_days: Number(formData.get('content_retention_days')),
      digest_prompt: digestPrompt,
    });
  }
```

- [ ] **Step 3: Add prompt textarea and reset button**

Add the following JSX after the Content Retention field (after line 192, before the submit button `<div className="pt-2">`):

```tsx
        <div>
          <label
            htmlFor="digest_prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Digest Prompt Template
          </label>
          <textarea
            id="digest_prompt"
            value={digestPrompt ?? DEFAULT_DIGEST_PROMPT}
            onChange={(e) => setDigestPrompt(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              Use <code className="bg-gray-100 px-1 rounded">---PHASE_SEPARATOR---</code> to
              split Phase 1 (screening) and Phase 2 (deep-dive) prompts.
            </p>
            <button
              type="button"
              onClick={() => setDigestPrompt(null)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Reset to Default
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Add the default prompt constant at the top of the file**

Add after the imports (line 6):

```typescript
const DEFAULT_DIGEST_PROMPT = `# Phase 1: Screening & Classification
You are a tech content curator. Classify the following content by topic and select the 3-5 most important items as headlines.

Importance criteria:
- Major releases or breakthroughs in AI/LLM
- Widely impactful technical changes
- Significant product launches

For non-headline items, write a one-liner summary each.

---PHASE_SEPARATOR---

# Phase 2: Headline Deep Dive
You are a senior tech journalist. Write detailed analysis for each important item in newspaper headline style:
- What is it and why it matters
- Impact on the industry/developers
- Key technical details`;
```

- [ ] **Step 5: Verify build**

Run: `pnpm --filter frontend build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "packages/frontend/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): add digest prompt template editor with reset button"
```

---

## Chunk 5: Frontend Digest Detail Rendering

### Task 5.1: Rewrite DigestDetail for New Format + Backward Compat

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/digests/page.tsx:6,317-383`

- [ ] **Step 1: Update imports**

At line 6, update the import to include new types:

```typescript
import type { Digest, TopicGroup, DigestOutput, DigestHeadline, DigestCategory, ApiError } from '@/lib/api-client';
import { isNewDigestFormat } from '@/lib/api-client';
```

- [ ] **Step 2: Rewrite `DigestDetail` component**

Replace the `DigestDetail` function (lines 317-359) with:

```tsx
function DigestDetail({ digest }: { digest: Digest }) {
  const topicGroups = digest.topic_groups;
  const isNewFormat = topicGroups && isNewDigestFormat(topicGroups);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-bold capitalize">{digest.digest_type} Digest</h2>
          <span className="text-sm text-gray-400">
            {new Date(digest.period_start).toLocaleDateString()} &ndash;{' '}
            {new Date(digest.period_end).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {digest.item_count} content items &middot; Language: {digest.language}
        </p>
      </div>

      {/* Trend Analysis */}
      {digest.trend_analysis && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Trend Analysis</h3>
          <p className="text-sm text-blue-900">{digest.trend_analysis}</p>
        </div>
      )}

      {isNewFormat ? (
        <NewFormatContent output={topicGroups as DigestOutput} />
      ) : (
        <OldFormatContent groups={(topicGroups ?? []) as TopicGroup[]} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add `NewFormatContent` component**

Add after `DigestDetail`:

```tsx
function NewFormatContent({ output }: { output: DigestOutput }) {
  return (
    <>
      {/* Headlines */}
      {output.headlines.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Headlines</h3>
          <div className="space-y-4">
            {output.headlines.map((headline) => (
              <HeadlineCard key={headline.item_id} headline={headline} />
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {output.categories.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Other Updates</h3>
          <div className="space-y-3">
            {output.categories.map((category, idx) => (
              <CategoryCard key={idx} category={category} />
            ))}
          </div>
        </div>
      )}

      {output.headlines.length === 0 && output.categories.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No content in this digest.
        </div>
      )}
    </>
  );
}

function HeadlineCard({ headline }: { headline: DigestHeadline }) {
  return (
    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-xs font-medium">
          {headline.topic}
        </span>
        <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs capitalize">
          {headline.platform}
        </span>
      </div>
      <h4 className="font-medium text-gray-900 mb-2">{headline.title}</h4>
      <p className="text-sm text-gray-700 whitespace-pre-line">{headline.analysis}</p>
      {headline.original_url && (
        <a
          href={headline.original_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs text-blue-600 hover:underline"
        >
          View original &rarr;
        </a>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: DigestCategory }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
      <h4 className="font-medium text-gray-900 mb-2">{category.topic}</h4>
      <ul className="space-y-1.5">
        {category.items.map((item) => (
          <li key={item.item_id} className="flex items-start gap-2 text-sm">
            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs capitalize flex-shrink-0 mt-0.5">
              {item.platform}
            </span>
            <span className="text-gray-600">{item.one_liner}</span>
            {item.original_url && (
              <a
                href={item.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline flex-shrink-0"
              >
                ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Add `OldFormatContent` wrapper**

Add a component for the old format that reuses the existing `TopicGroupCard`:

```tsx
function OldFormatContent({ groups }: { groups: TopicGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No topic groups in this digest.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Topics</h3>
      {groups.map((group, idx) => (
        <TopicGroupCard key={idx} group={group} />
      ))}
    </div>
  );
}
```

Keep the existing `TopicGroupCard` component (lines 361-383) unchanged — it's used by `OldFormatContent`.

- [ ] **Step 5: Verify build**

Run: `pnpm --filter frontend build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "packages/frontend/src/app/(dashboard)/digests/page.tsx"
git commit -m "feat(digests): render new headlines+categories format with backward compat"
```

---

## Chunk 6: Integration Wiring + Final Verification

### Task 6.1: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: Clean (no type errors).

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Run full build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve integration issues from digest pipeline redesign"
```

---

### Task 6.2: Migration Verification (Manual)

This task requires a running database. Skip in CI; run manually:

- [ ] **Step 1: Run migration**

Run: `pnpm --filter backend db:migrate`
Expected: Migration applies successfully.

- [ ] **Step 2: Verify column exists**

Connect to PostgreSQL and run:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'digest_prompt';
```
Expected: `text`, `YES` (nullable).

---

## Summary

| Chunk | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1 | 1.1–1.5 | DB migration, new types, ContentFormatter, PromptSplitter, remove old builders |
| 2 | 2.1 | ResponseValidator with Phase 1/2 validation + dedup |
| 3 | 3.1–3.5 | Rewrite digest.service.ts: new imports, generateDigest, Phase1/Phase2 executors, remove old methods, update stub |
| 4 | 4.1–4.3 | User service + DTO + API types + settings page prompt editor |
| 5 | 5.1 | DigestDetail rewrite with headlines/categories + backward compat |
| 6 | 6.1–6.2 | Full build verification + migration test |
