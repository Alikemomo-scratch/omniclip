# Digest Customization: User-Configurable Topics, Headline Count & Prompt

**Date**: 2026-04-27
**Status**: Draft
**Prerequisite**: `feature/digest-pipeline-redesign` branch merged to main (all 17 tasks complete)

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
- When `mode = "raw"`, the backend uses the `digest_prompt` text directly (existing behavior).
- The two modes are mutually exclusive — switching modes does not destroy settings from the other mode.

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
digestPrompt: text('digest_prompt'),   // Existing column, kept for raw mode
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

### 2. Prompt Builder from Config

**File**: `packages/backend/src/digest/prompts/digest.prompts.ts` (new export)

A new function `buildPhase1PromptFromConfig(config: DigestConfig): string` that generates a Phase 1 prompt incorporating topic preferences and headline count:

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

Phase 2 prompt does not change — it always uses the default (or user raw prompt). Topic filtering happens at the Phase 1 level.

### Language Handling

The existing `buildLanguageInstruction(language)` in `DigestService` already appends a language instruction to every LLM call based on the user's `preferred_language` setting. This applies to both Phase 1 and Phase 2 — all output (headlines, category summaries, trend analysis) is generated in the user's preferred language. No additional language logic is needed for this feature.

### 3. DigestService Integration

**File**: `packages/backend/src/digest/digest.service.ts`

Current flow in `generateDigest()`:
```
fetchUserDigestPrompt(userId) → splitPromptTemplate(prompt) → executePhase1(phase1Prompt, ...)
```

New flow:
```
fetchUserDigestConfig(userId) → resolvePrompts(config, rawPrompt) → executePhase1(phase1Prompt, ...)
```

```typescript
private async fetchUserDigestConfig(userId: string): Promise<DigestConfig> {
  return withRlsContext(this.db, userId, async (tx) => {
    const [row] = await tx
      .select({ digestConfig: users.digestConfig })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return (row?.digestConfig as DigestConfig) ?? DEFAULT_DIGEST_CONFIG;
  });
}

private resolvePrompts(
  config: DigestConfig,
  rawPrompt: string | null,
): { phase1: string; phase2: string } {
  if (config.mode === 'raw') {
    return splitPromptTemplate(rawPrompt);
  }
  // Structured mode: generate Phase 1 from config, Phase 2 stays default
  return {
    phase1: buildPhase1PromptFromConfig(config),
    phase2: DEFAULT_PHASE2_PROMPT,
  };
}
```

The `generateDigest()` method fetches both `digestConfig` and `digestPrompt`, then calls `resolvePrompts()`.

### 4. Headline Count Enforcement

The existing `ResponseValidator` caps headlines at 10 (hardcoded). In structured mode, the validator should respect the user's `headlineCount` setting:

- `validatePhase1Response` receives an optional `headlineCount` parameter.
- When provided, headlines beyond `headlineCount` are dropped (with a log warning).
- Default remains 10 when not specified (raw mode or missing config).

### 5. API Endpoints

All digest config operations go through the existing user profile endpoint — no new controllers needed.

**Existing**: `PATCH /api/v1/users/me` — already handles `digest_prompt`.

**Extension**: Accept `digest_config` in the same DTO.

```typescript
// update-user.dto.ts — new field
@IsOptional()
@ValidateIf((o) => o.digest_config !== null)
digest_config?: DigestConfig | null;
```

**New**: `GET /api/v1/digest/topics` — returns preset topic list.

```typescript
// In digest.controller.ts
@Get('topics')
getAvailableTopics() {
  return { topics: PRESET_TOPICS };
}
```

This endpoint is public (no auth needed) since the preset list is not user-specific.

### 6. UsersService Changes

**File**: `packages/backend/src/users/users.service.ts`

- `findById()`: Add `digestConfig` to the select list.
- `update()`: Handle `dto.digest_config` → `updateData.digestConfig`.
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
  // ... existing fields ...
  digest_prompt: string | null;
  digest_config: DigestConfig | null;
}

export const digestApi = {
  // ... existing methods ...
  getAvailableTopics(): Promise<{ topics: PresetTopic[] }> {
    return apiClient.get('/digest/topics');
  },
};
```

### 2. Settings Page

**File**: `packages/frontend/src/app/(dashboard)/settings/page.tsx`

Replace the current `<textarea>` prompt editor with a mode toggle:

**Structured Mode** (default):
- **Topic Selection**: Checkboxes for preset topics + an "Add Custom Topic" input field with tag-style chips for custom topics.
- **Headline Count**: A number input or slider (range 1–10, default 5) with label "Number of detailed headlines".
- Clean, form-based UI. No prompt text visible.

**Raw Prompt Mode** (advanced):
- The existing textarea editor (Phase 1 + `---PHASE_SEPARATOR---` + Phase 2).
- Shown when user toggles to "Advanced" / "Raw Prompt" mode.
- A warning note: "Switching to structured mode will override this prompt."

**Mode Toggle**: A segmented control or tab at the top of the "Digest Configuration" section:
```
[Structured] [Advanced]
```

Switching modes updates `digest_config.mode` but preserves both `digest_config` settings and `digest_prompt` text — the non-active one is simply ignored by the backend.

### 3. State Management

- On page load: fetch user profile (includes `digest_config` and `digest_prompt`).
- If `digest_config` is null → show structured mode with defaults.
- On save: send both `digest_config` and `digest_prompt` to `PATCH /users/me`.
- Mode toggle is a local UI state that also updates `digest_config.mode`.

## Migration Strategy

1. **Merge `feature/digest-pipeline-redesign` branch** first — this adds `digestPrompt` column and the two-phase pipeline.
2. **Add `digest_config` JSONB column** via SQL migration (nullable, no default needed — null = use `DEFAULT_DIGEST_CONFIG`).
3. **No data migration needed** — existing users with null `digest_config` get default structured behavior automatically.
4. Users who previously set a custom `digest_prompt` (raw text) will have their `digest_config` default to structured mode, but their raw prompt is preserved. They can switch to raw mode in settings to use it.

## Validation Rules

| Field | Rule |
|-------|------|
| `mode` | Must be `'structured'` or `'raw'` |
| `selectedTopics` | Array of strings; each must be a valid preset topic ID |
| `customTopics` | Array of strings; each max 100 chars; max 20 custom topics |
| `headlineCount` | Integer 1–10 |

Invalid preset topic IDs in `selectedTopics` are silently ignored (future-proofs preset list changes).

## Testing Strategy

### Unit Tests
- `buildPhase1PromptFromConfig()` — verify generated prompt includes topic names and headline count.
- `resolvePrompts()` — verify structured vs raw mode routing.
- `validatePhase1Response()` with custom headline count.
- DTO validation for `digest_config` field.

### Integration Tests
- `PATCH /users/me` with `digest_config` — verify persistence and retrieval.
- `GET /digest/topics` — verify returns preset list.
- Digest generation with structured config — verify topic filtering in Phase 1 output.

### Frontend Tests
- Mode toggle switches between structured form and textarea.
- Topic selection persists on save.
- Custom topic add/remove works.
- Headline count slider updates config.

## Out of Scope

- Per-topic headline count (user asked for global cap only).
- Topic auto-discovery from content (Phase 2 feature — could analyze past digests to suggest topics).
- Phase 2 prompt customization in structured mode (only Phase 1 is affected by topic/count config).
