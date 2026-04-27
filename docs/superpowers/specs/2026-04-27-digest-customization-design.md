# Digest Customization: User-Configurable Topics, Headline Count & Prompt

**Date**: 2026-04-27
**Status**: Draft
**Prerequisite**: `feature/digest-pipeline-redesign` branch merged to main (all 17 tasks complete). This spec references units introduced by the redesign: `splitPromptTemplate`, `DEFAULT_PHASE1_PROMPT`, `DEFAULT_PHASE2_PROMPT`, `PHASE1_JSON_SCHEMA`, `PHASE2_JSON_SCHEMA`, `validatePhase1Response`, `validatePhase2Response`, `deduplicatePhase1Result`, `formatContentItems`, `ContentItemForDigest`, `Phase1Result`, `DigestOutput`, `DigestHeadline`, `DigestCategory`.

## Problem

The current digest pipeline (from the redesign branch) hardcodes:
1. **Topic coverage** — AI decides which topics to analyze deeply; users have no control.
2. **Headline count** — The default prompt says "3-5 most important items"; not configurable.
3. **Prompt editing** — The redesign branch adds a raw textarea editor, but it requires understanding prompt structure to use effectively.

Users need a way to customize what their digest focuses on without needing to understand prompt engineering.

## Goals

1. Let users select **which topics** get detailed analysis (Phase 2 deep-dive).
2. Let users set the **total number of headline items** for detailed analysis.
3. Provide both a **structured UI** (topic checkboxes + headline count slider) and a **raw prompt editor** as mutually exclusive modes.
4. Unselected topics still appear in the digest summary/categories — they are not filtered from the digest entirely. Each non-headline item receives a 1–2 sentence summary explaining what it covers.
5. All digest output (headlines, category summaries, trend analysis) is generated in the user's `preferred_language` setting.

## Chosen Approach

**Approach A: JSON config column + runtime prompt generation.**

- New `digest_config` JSONB column on `users` table alongside existing `digest_prompt` TEXT column.
- When `mode = "structured"`, the backend generates prompt text at runtime from the structured config (injecting topic preferences and headline count).
- When `mode = "raw"`, the backend uses the `digest_prompt` text directly (existing behavior from redesign branch).
- The two modes are mutually exclusive — switching modes preserves both `digest_config` and `digest_prompt` in the database; only the active mode's settings are used at digest generation time.

## Data Model

### DigestConfig Type

```typescript
interface DigestConfig {
  mode: 'structured' | 'raw';
  selectedTopics: string[];    // Preset topic IDs (e.g., "ai-ml", "crypto")
  customTopics: string[];      // User-defined topic strings (e.g., "DeFi协议安全")
  headlineCount: number;       // Global headline cap (1–10, default 5)
}
```

**Why separate `selectedTopics` and `customTopics`:**
- Preset list can be updated without affecting user settings.
- Frontend can render preset checkboxes and custom tags differently.

### Default Value (new users or null)

```json
{
  "mode": "structured",
  "selectedTopics": ["ai-ml", "crypto", "programming", "startup-vc"],
  "customTopics": [],
  "headlineCount": 5
}
```

When `digest_config` is null, the backend treats it as the default above.

### Schema Change

```typescript
// In schema/index.ts — users table
digestConfig: jsonb('digest_config'),  // New column, nullable, default null
digestPrompt: text('digest_prompt'),   // Existing column (from redesign branch), kept for raw mode
```

SQL migration:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_config JSONB;
```

### Preset Topic List

Defined as a backend constant (`PRESET_TOPICS`), also served via API for frontend consumption.

| ID | Label | Description |
|----|-------|-------------|
| `ai-ml` | AI / Machine Learning | AI, large language models, ML tooling |
| `crypto` | Crypto / Web3 | Cryptocurrency, DeFi, blockchain |
| `programming` | Programming / Dev Tools | Languages, frameworks, open source |
| `startup-vc` | Startups / VC | Fundraising, product launches, founder news |
| `finance` | Finance / Markets | Financial markets, macroeconomics |
| `science` | Science / Research | Scientific research, academic papers |
| `politics` | Politics / Policy | Policy, regulation, geopolitics |
| `culture` | Culture / Media | Culture, media, social trends |

## Backend Changes

### 1. Preset Topics Constant

**File**: `packages/backend/src/digest/prompts/digest.prompts.ts`

```typescript
export interface PresetTopic {
  id: string;
  label: string;
  description: string;
}

export const PRESET_TOPICS: PresetTopic[] = [
  { id: 'ai-ml', label: 'AI / Machine Learning', description: 'AI, large language models, ML tooling' },
  { id: 'crypto', label: 'Crypto / Web3', description: 'Cryptocurrency, DeFi, blockchain' },
  { id: 'programming', label: 'Programming / Dev Tools', description: 'Languages, frameworks, open source' },
  { id: 'startup-vc', label: 'Startups / VC', description: 'Fundraising, product launches, founder news' },
  { id: 'finance', label: 'Finance / Markets', description: 'Financial markets, macroeconomics' },
  { id: 'science', label: 'Science / Research', description: 'Scientific research, academic papers' },
  { id: 'politics', label: 'Politics / Policy', description: 'Policy, regulation, geopolitics' },
  { id: 'culture', label: 'Culture / Media', description: 'Culture, media, social trends' },
];

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  mode: 'structured',
  selectedTopics: ['ai-ml', 'crypto', 'programming', 'startup-vc'],
  customTopics: [],
  headlineCount: 5,
};
```

### 2. Config Normalization

**File**: `packages/backend/src/digest/prompts/digest.prompts.ts` (new export)

A pure function that sanitizes `digest_config` read from the database or received from the API. Used in two places: (a) DTO validation on API write, (b) digest generation on DB read.

```typescript
export function normalizeDigestConfig(input: unknown): DigestConfig {
  if (!input || typeof input !== 'object') return { ...DEFAULT_DIGEST_CONFIG };

  const raw = input as Record<string, unknown>;

  const mode = raw.mode === 'raw' ? 'raw' : 'structured';

  const validTopicIds = new Set(PRESET_TOPICS.map(t => t.id));
  const selectedTopics = Array.isArray(raw.selectedTopics)
    ? [...new Set(
        (raw.selectedTopics as unknown[])
          .filter((v): v is string => typeof v === 'string' && validTopicIds.has(v))
      )]
    : [...DEFAULT_DIGEST_CONFIG.selectedTopics];

  const customTopics = Array.isArray(raw.customTopics)
    ? [...new Set(
        (raw.customTopics as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim().slice(0, 100))
      )].slice(0, 20)
    : [];

  const headlineCount =
    typeof raw.headlineCount === 'number'
    && Number.isInteger(raw.headlineCount)
    && raw.headlineCount >= 1
    && raw.headlineCount <= 10
      ? raw.headlineCount
      : DEFAULT_DIGEST_CONFIG.headlineCount;

  return { mode, selectedTopics, customTopics, headlineCount };
}
```

**Normalization rules (single source of truth):**

| Field | Invalid input | Behavior |
|-------|---------------|----------|
| `mode` | Not `'structured'` or `'raw'` | Default to `'structured'` |
| `selectedTopics` | Non-array, or contains non-string / unknown IDs | Filter to valid IDs only; if empty after filter, use default |
| `customTopics` | Non-array, or contains non-string / empty / whitespace | Trim, dedupe, cap at 100 chars each, max 20 items |
| `headlineCount` | Non-integer, out of 1–10 range | Default to 5 |
| Entire object | null, undefined, non-object, malformed JSON | Return `DEFAULT_DIGEST_CONFIG` |

**No 400 rejection for invalid topic IDs** — the normalizer silently cleans them. This future-proofs preset list changes (removing a preset topic won't break saved user configs).

### 3. Prompt Builder from Config

**File**: `packages/backend/src/digest/prompts/digest.prompts.ts` (new export)

A new function `buildPhase1PromptFromConfig(config: DigestConfig): string` that generates a Phase 1 prompt incorporating topic preferences and headline count. The `config` argument must be pre-normalized via `normalizeDigestConfig`.

```typescript
export function buildPhase1PromptFromConfig(config: DigestConfig): string {
  const allTopics = [
    ...PRESET_TOPICS
      .filter(t => config.selectedTopics.includes(t.id))
      .map(t => t.label),
    ...config.customTopics,
  ];

  const topicList = allTopics.length > 0
    ? allTopics.map(t => `- ${t}`).join('\n')
    : '- (All topics — no specific filter)';

  return `You are a tech content curator. Classify the following content by topic and select the ${config.headlineCount} most important items as headlines.

Focus your detailed headline selection on these topics (prioritize these for deep-dive analysis):
${topicList}

Items from other topics should still be classified into categories. For every non-headline item, write a 1–2 sentence summary describing what it covers and why it is noteworthy.

Importance criteria:
- Major releases or breakthroughs
- Widely impactful technical changes
- Significant product launches

For non-headline items, group them by topic and write a concise 1–2 sentence summary for each item.`;
}
```

Phase 2 prompt does not change — it always uses `DEFAULT_PHASE2_PROMPT` in structured mode, or the user's raw Phase 2 prompt in raw mode. Topic filtering happens at the Phase 1 level.

### Language Handling

The existing `buildLanguageInstruction(language)` in `DigestService` already appends a language instruction to every LLM call based on the user's `preferred_language` setting. This applies to both Phase 1 and Phase 2 — all output (headlines, category summaries, trend analysis) is generated in the user's preferred language. No additional language logic is needed for this feature.

### 4. DigestService Integration

**File**: `packages/backend/src/digest/digest.service.ts`

Current flow in `generateDigest()` (from redesign branch):
```
fetchUserDigestPrompt(userId) → splitPromptTemplate(prompt) → executePhase1(phase1Prompt, ...)
```

New flow:
```
fetchUserSettings(userId) → normalizeDigestConfig(config) → resolvePrompts(config, rawPrompt) → executePhase1(phase1Prompt, ..., headlineCount)
```

#### Single-Read Snapshot

Both `digest_config` and `digest_prompt` are fetched in a single query to prevent race conditions:

```typescript
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
```

#### Prompt Resolution

```typescript
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
```

### 5. Headline Count Enforcement & Excess Demotion

The existing `ResponseValidator` caps headlines at 10 (hardcoded). In structured mode, the validator respects the user's `headlineCount` setting:

- `validatePhase1Response` receives an optional `headlineCount` parameter (default 10 for raw mode).
- When the LLM returns more headlines than `headlineCount`, excess headlines are **demoted to categories**: each excess headline becomes a category item with its `topic` from the Phase 1 response and a `one_liner` set to `"(Demoted from headlines)"`. The digest service or the caller should provide a proper one-liner if the LLM returned one, but the fallback placeholder ensures no content is silently lost.
- A warning is logged with the count of demoted headlines.

**Why demotion instead of dropping:** Goal 4 states that all content items must appear in the final digest — either as headlines or as categorized items with summaries. Dropping excess headlines would violate this.

### 6. Structured Mode Fallback Policy

The existing redesign pipeline has a fallback: if Phase 1 fails validation with the user prompt, it retries with `DEFAULT_PHASE1_PROMPT`.

In structured mode, the fallback behavior is:

1. Phase 1 is called with the prompt generated by `buildPhase1PromptFromConfig(config)`.
2. If that fails validation → **retry with the same generated prompt** (transient LLM error).
3. If the retry also fails validation → **fall back to `DEFAULT_PHASE1_PROMPT`** but **preserve the user's `headlineCount`** in the validator. Topic preferences are lost in this fallback, but the headline count cap is still enforced.
4. A warning is logged: "Structured prompt failed, falling back to default. User topic preferences not applied."

This ensures digest generation never fails entirely due to a bad structured prompt, while preserving as much user preference as possible.

### 7. API Endpoints

#### Config via existing user profile endpoint

All digest config operations go through the existing user profile endpoint — no new controllers needed.

**Existing**: `PATCH /api/v1/users/me` — already handles `digest_prompt` (from redesign branch).

**Extension**: Accept `digest_config` in the same DTO. The DTO applies `normalizeDigestConfig` before saving.

```typescript
// update-user.dto.ts — new field
@IsOptional()
@ValidateIf((o) => o.digest_config !== null)
digest_config?: DigestConfig | null;
```

In `UsersService.update()`, before writing to DB:
```typescript
if (dto.digest_config !== undefined) {
  updateData.digestConfig = dto.digest_config !== null
    ? normalizeDigestConfig(dto.digest_config)
    : null;
}
```

#### Preset topics endpoint

**Route**: `GET /api/v1/digests/topics` — note: uses the existing `digests` controller prefix.

**Auth**: This endpoint requires authentication (same as all other digest endpoints under the class-level JWT guard). The preset list is static, but keeping it behind auth simplifies the controller setup and is consistent with the existing pattern.

```typescript
// In digest.controller.ts (existing @Controller('digests') with JWT guard)
@Get('topics')
getAvailableTopics() {
  return { topics: PRESET_TOPICS };
}
```

### 8. UsersService Changes

**File**: `packages/backend/src/users/users.service.ts`

- `findById()`: Add `digestConfig` to the select list.
- `update()`: Handle `dto.digest_config` → `normalizeDigestConfig(dto.digest_config)` → `updateData.digestConfig`.
- `formatUser()`: Include `digest_config` in the response object.

## Frontend Changes

### 1. API Types

**File**: `packages/frontend/src/lib/api-client.ts`

```typescript
export interface PresetTopic {
  id: string;
  label: string;
  description: string;
}

export interface DigestConfig {
  mode: 'structured' | 'raw';
  selectedTopics: string[];
  customTopics: string[];
  headlineCount: number;
}

export interface User {
  // ... existing fields (from redesign branch: includes digest_prompt) ...
  digest_prompt: string | null;
  digest_config: DigestConfig | null;
}

export const digestApi = {
  // ... existing methods ...
  getAvailableTopics(): Promise<{ topics: PresetTopic[] }> {
    return apiClient.get('/digests/topics');
  },
};
```

### 2. Settings Page

**File**: `packages/frontend/src/app/(dashboard)/settings/page.tsx`

Replace the prompt textarea editor (from redesign branch) with a mode toggle:

**Structured Mode** (default):
- **Topic Selection**: Checkboxes for preset topics (fetched from `/digests/topics`) + an "Add Custom Topic" input field with tag-style chips for custom topics.
- **Headline Count**: A number input (range 1–10, default 5) with label "Number of detailed headlines".
- Clean, form-based UI. No prompt text visible.

**Raw Prompt Mode** (advanced):
- The existing textarea editor (Phase 1 + `---PHASE_SEPARATOR---` + Phase 2).
- Shown when user toggles to "Advanced" / "Raw Prompt" mode.
- A note: "In raw mode, topic selection and headline count settings above are ignored. The system uses your prompt text directly."

**Mode Toggle**: A segmented control or tab at the top of the "Digest Configuration" section:
```
[Structured] [Advanced]
```

Switching modes updates `digest_config.mode` but preserves both `digest_config` structured settings and `digest_prompt` text in the database. The backend ignores whichever mode is not active.

### 3. State Management

- On page load: fetch user profile (`GET /users/me`, includes `digest_config` and `digest_prompt`) and preset topics (`GET /digests/topics`).
- If `digest_config` is null → show structured mode with defaults from `DEFAULT_DIGEST_CONFIG`.
- On save: send both `digest_config` and `digest_prompt` to `PATCH /users/me`. This ensures neither field is accidentally cleared.
- Mode toggle is a local UI state that also updates `digest_config.mode`.

## Migration Strategy

1. **Merge `feature/digest-pipeline-redesign` branch** first — this adds `digestPrompt` column and the two-phase pipeline.
2. **Add `digest_config` JSONB column** via SQL migration (nullable, no default needed — null = use `DEFAULT_DIGEST_CONFIG`).
3. **No data migration needed** — existing users with null `digest_config` get default structured behavior automatically.
4. Users who previously set a custom `digest_prompt` (raw text) will have their `digest_config` default to structured mode, but their raw prompt is preserved in `digest_prompt`. They can switch to raw mode in settings to use it.

## Validation Rules

All validation is handled by `normalizeDigestConfig` (see section 2). The normalizer is the single source of truth — it cleans on both API write and DB read.

| Field | Invalid input | Behavior |
|-------|---------------|----------|
| `mode` | Not `'structured'` or `'raw'` | Default to `'structured'` |
| `selectedTopics` | Non-array, or contains non-string / unknown IDs | Filter to valid IDs; if result is empty, use default selection |
| `customTopics` | Non-array, or contains non-string / empty / whitespace | Trim, dedupe, cap at 100 chars each, max 20 items |
| `headlineCount` | Non-integer, out of 1–10 range | Default to 5 |
| Entire object | null, undefined, non-object, malformed JSON | Return `DEFAULT_DIGEST_CONFIG` |

## Testing Strategy

### Unit Tests
- `normalizeDigestConfig()` — malformed input, null, missing fields, unknown topic IDs, out-of-range headlineCount, duplicate customTopics, empty strings, whitespace-only strings.
- `buildPhase1PromptFromConfig()` — verify generated prompt includes topic names, headline count, and category instruction.
- `resolvePrompts()` — verify structured vs raw mode routing; verify raw mode delegates to `splitPromptTemplate`.
- `validatePhase1Response()` with custom headline count — verify excess headlines are demoted to categories (not dropped).

### Integration Tests
- `PATCH /users/me` with `digest_config` — verify normalization on save and retrieval.
- `PATCH /users/me` with malformed `digest_config` — verify normalizer cleans it.
- `GET /digests/topics` — verify returns preset list, requires auth.
- Digest generation with structured config — verify topic filtering in Phase 1 output.
- Structured mode fallback — verify default prompt retry preserves headline count.

### Frontend Tests
- Mode toggle switches between structured form and textarea.
- Topic selection persists on save.
- Custom topic add/remove works; duplicates are prevented.
- Headline count input enforces 1–10 range.
- Saving in one mode does not clear the other mode's settings.

## Out of Scope

- Per-topic headline count (user asked for global cap only).
- Topic auto-discovery from content (future feature — could analyze past digests to suggest topics).
- Phase 2 prompt customization in structured mode (only Phase 1 is affected by topic/count config).
