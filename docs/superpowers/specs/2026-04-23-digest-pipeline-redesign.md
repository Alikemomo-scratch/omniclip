# Digest Pipeline Redesign: Two-Phase Screening + Deep Dive

**Date**: 2026-04-23
**Status**: Approved

## Problem

Current digest generation has two issues:
1. Content items are formatted inconsistently before being sent to the LLM.
2. The LLM prompt is hardcoded — users cannot customize classification criteria, importance judgment, or output style.
3. All content receives equal treatment — no distinction between headline-worthy items and minor updates.

## Design

### Overview

Replace the existing map-reduce pipeline with a two-phase **screen → deep-dive** pipeline. Expose the prompt as a single user-editable template (stored in settings) that the system internally splits into two phases.

### Phase 1: Screening & Classification

**Input**: All content items in standardized summary format (body truncated to 500 chars).

**LLM task**: Classify items by topic, judge importance, output two groups:
- `headlines`: Objects with `item_id` and `topic` for items flagged as important (to be deep-dived in Phase 2)
- `categories`: Grouped minor items, each with `item_id` and `one_liner` summary
- `trend_analysis`: Cross-platform trend paragraph

**Phase 1 JSON schema** (appended by system):
```json
{
  "headlines": [{ "item_id": "uuid", "topic": "string" }],
  "categories": [{ "topic": "string", "items": [{ "item_id": "uuid", "one_liner": "string" }] }],
  "trend_analysis": "string"
}
```

**Output**: Structured JSON with headline IDs + topics + categorized minor items.

**Validation**: System validates all returned `item_id` values exist in the input set. Duplicates and unknown IDs are silently dropped.

**Deduplication rule**: A single `item_id` must appear in exactly one section. Headlines take precedence — if an item appears in both `headlines` and `categories`, it is kept in `headlines` and removed from `categories`. Within `categories`, if an item appears in multiple topics, only the first occurrence is kept.

### Phase 2: Headline Deep Dive

**Input**: Only the items flagged as headlines — with **full original content** (body up to 3000 chars).

**LLM task**: Write detailed newspaper-style analysis for each headline item. Return `item_id` with each analysis for stable merging.

**Phase 2 JSON schema** (appended by system):
```json
[{ "item_id": "uuid", "title": "string", "analysis": "string" }]
```

**Output**: Array of headline objects with `item_id`, `title`, `analysis`. The system back-fills `topic` (from Phase 1), `platform`, and `original_url` (from source data) — these fields are never LLM-generated to avoid hallucination.

**Validation**: System matches returned `item_id` values against Phase 1 headlines. Missing analyses are logged and the headline is dropped from output. Extra/unknown IDs are silently dropped.

### Content Standardization Format

Every content item is converted to a uniform text block for LLM consumption:

```
[{index}] id:{id} | {platform}/{content_type} | {published_at}
  Title: {title}
  Author: {author_name}
  Content: {body}
  URL: {original_url}
  Metrics: {key metrics from metadata}
```

Phase 1 truncates body to 500 chars. Phase 2 uses full body up to 3000 chars.

Metrics are extracted from metadata based on platform:
- Twitter: likes, retweets, replies, views
- GitHub: stars, forks, language, tags
- YouTube: views, likes, duration

### User-Customizable Prompt

**Storage**: New `digest_prompt` column (text, nullable) on the `users` table. When null, the system default prompt is used.

**UI**: A textarea in the user settings page with:
- The current prompt pre-filled (default if never customized)
- A "Reset to Default" button
- Brief usage instructions

**Template structure**: A single text template with `---PHASE_SEPARATOR---` dividing the two phases:

**`PromptSplitter` rules**:
- Input is trimmed. If trimmed result is empty → use system default prompt for both phases.
- Split on the **first** occurrence of `---PHASE_SEPARATOR---` (exact literal match). Content before = Phase 1, content after = Phase 2.
- If multiple `---PHASE_SEPARATOR---` exist, only the first is used as the split point; remaining separators are part of the Phase 2 text.
- If no separator found → entire prompt is Phase 1; Phase 2 uses system default.
- Each phase's text is trimmed independently. If a phase's text is empty after trim → that phase uses system default.

```
# Phase 1: Screening & Classification
You are a tech content curator. Classify the following content by topic and select
3-5 most important items as headlines.

Importance criteria:
- Major releases or breakthroughs in AI/LLM
- Widely impactful technical changes
- Significant product launches

For non-headline items, write a one-liner summary each.

---PHASE_SEPARATOR---

# Phase 2: Headline Deep Dive
You are a senior tech journalist. Write detailed analysis for each important item
in newspaper headline style:
- What is it and why it matters
- Impact on the industry/developers
- Key technical details
```

The system appends the JSON schema requirement and content data automatically — users only write the instruction portion.

**Language injection**: The system always appends a language instruction (e.g., "Respond in Chinese" / "Respond in English") after the user's prompt text and before the content data, based on the user's `preferred_language` setting. Users do not need to specify language in their prompt template.

### Output JSON Structure

```typescript
interface DigestOutput {
  headlines: {
    item_id: string;       // from Phase 1
    topic: string;         // from Phase 1
    title: string;         // LLM-generated (Phase 2)
    analysis: string;      // LLM-generated (Phase 2)
    platform: string;      // system back-filled from source data
    original_url: string;  // system back-filled from source data
  }[];

  categories: {
    topic: string;           // LLM-generated (Phase 1)
    items: {
      item_id: string;      // from Phase 1
      one_liner: string;    // LLM-generated (Phase 1)
      platform: string;     // system back-filled from source data
      original_url: string; // system back-filled from source data
    }[];
  }[];

  trend_analysis: string;  // LLM-generated (Phase 1)
}
```

This replaces the existing `topic_groups` JSONB field. The column is reused (same `topic_groups` jsonb column) but stores the new shape. The existing `trend_analysis` text column is **kept and continues to be the authoritative source** for trend analysis — it is written from `DigestOutput.trend_analysis` on save, same as today.

**Storage contract**:
- `topic_groups` JSONB column: Stores the full `DigestOutput` object (headlines + categories + trend_analysis).
- `trend_analysis` text column: Also stores the trend_analysis string (duplicated for backward-compatible list queries that only need this field).
- On read: Frontend uses `topic_groups` for full rendering. List views may use `trend_analysis` directly.

Frontend must handle both old and new shapes for backward compatibility with existing digests.

### Pipeline Execution

```
generateDigest(userId, digestType, periodStart, periodEnd, language)
  1. Create pending digest record (status: 'pending')
  2. Update status → 'generating'
  3. Fetch user's digest_prompt (null/empty → use default)
  4. PromptSplitter: split by ---PHASE_SEPARATOR--- → { phase1, phase2 }
  5. Fetch content_items for the time period
  6. ContentFormatter: format all items (500 char body) → summaries[]
  7. Phase1Executor: phase1 prompt + summaries + schema → LLM
     → ResponseValidator: validate JSON, filter invalid item_ids
     → Back-fill platform/original_url from source data on categories
     → Result: headlines[{item_id, topic}] + categories[] + trend_analysis
  8. If headlines is empty → skip to step 10
  9. ContentFormatter: format headline items (3000 char body) → fullContent[]
     Phase2Executor: phase2 prompt + fullContent + schema → LLM
     → ResponseValidator: validate JSON, match item_ids against Phase 1
     → Merge: topic from Phase 1, title+analysis from Phase 2, platform+url from source
  10. Assemble final DigestOutput, save to digest record
  11. Link all content items fetched in step 5 via digest_items join table (includes both headline and category items — represents the full input set for this digest)
  12. Update status → 'completed'
```

If the prompt has no `---PHASE_SEPARATOR---`, the entire prompt is used for Phase 1 only, and Phase 2 uses a hardcoded default deep-dive prompt.

### Affected Components

**Database**:
- `users` table: Add `digest_prompt` text column (nullable). Null and empty string both mean "use system default".
- Migration: `0003_add_digest_prompt.sql`

**Backend unit boundaries**:

| Unit | Responsibility | Interface |
|------|---------------|-----------|
| `ContentFormatter` | Convert content items → standardized text blocks | `format(items, maxBodyLength) → string[]` |
| `PromptSplitter` | Split user template by separator; fall back to defaults | `split(template) → { phase1: string, phase2: string }` |
| `Phase1Executor` | Run Phase 1 LLM call, validate response, back-fill system fields | `execute(prompt, formattedItems, sourceItems) → Phase1Result` |
| `Phase2Executor` | Run Phase 2 LLM call, validate response, merge with Phase 1 | `execute(prompt, headlineItems, phase1Headlines) → HeadlineResult[]` |
| `ResponseValidator` | Validate LLM JSON against schema, filter invalid item_ids | `validate(response, schema, validIds) → parsed \| error` |
| `DigestPipeline` | Orchestrate all units, handle errors, save result | `run(userId, type, period, language) → Digest` |

**Backend files**:
- `digest.service.ts`: Hosts `DigestPipeline` orchestration (rewrite `generateDigest`)
- `prompts/digest.prompts.ts`: `ContentFormatter`, `PromptSplitter`, default prompt template, JSON schema strings
- `prompts/digest.validators.ts`: `ResponseValidator` for Phase 1 and Phase 2 outputs
- `users.service.ts` / DTO: Expose `digest_prompt` field in update profile
- `users.controller.ts`: Ensure PATCH /users/me handles `digest_prompt`

**Frontend**:
- Settings page: Add prompt editor textarea with reset button
- `DigestDetail` component: Render new `headlines[]` + `categories[]` structure
- Backward compatibility: Detect old `topic_groups` shape and render with existing logic
- API client: Update user profile types, digest response types

**Unchanged**:
- Digest CRUD, archive/delete, scheduling, `digest_items` join table
- Content sync pipeline
- Digest list page (only detail rendering changes)

### Backward Compatibility

Existing digests have `topic_groups` in the old shape:
```typescript
{ topic: string; summary: string; item_ids: string[]; platforms: string[] }[]
```

Frontend detects shape by checking for `headlines` key:
- Present → new format, render headlines + categories
- Absent → old format, render with existing TopicGroupCard

### Edge Cases

- **No content items**: Skip LLM calls, save digest with status `completed`, item_count 0, and `topic_groups` set to the canonical empty shape: `{ "headlines": [], "categories": [], "trend_analysis": "" }`. This ensures frontend always detects new format via the `headlines` key.
- **<5 items**: Still run both phases (Phase 1 may flag 0-2 headlines).
- **Phase 1 flags 0 headlines**: Skip Phase 2, output only categories + trend_analysis with empty `headlines[]`.
- **Headline cap**: System enforces a hard cap of 10 headlines regardless of user prompt. If Phase 1 returns more than 10, only the first 10 are kept as headlines; the rest are silently dropped (they were already classified with a topic by Phase 1 but receive no deep-dive). A warning is logged with the count of dropped headlines.
- **Missing PHASE_SEPARATOR**: Use entire prompt for Phase 1, system default prompt for Phase 2.

### Error Handling

**Per-phase failure matrix**:

| Scenario | Phase 1 | Phase 2 | Digest Status |
|----------|---------|---------|---------------|
| User prompt succeeds | ✅ | ✅ | `completed` |
| User prompt Phase 1 fails (parse/schema) | Retry with default prompt | — (not reached yet) | Depends on retry |
| Default prompt Phase 1 fails | ❌ | — (skipped) | `failed` |
| Phase 1 OK, user prompt Phase 2 fails | Keep Phase 1 result | Retry with default prompt | Depends on retry |
| Phase 1 OK, default prompt Phase 2 fails | Keep Phase 1 result | ❌ | `completed` (categories-only, empty headlines, log warning) |
| Phase 1 OK, Phase 2 partial (some headlines missing) | Keep Phase 1 result | Keep successful headlines | `completed` (log warnings for missing) |
| LLM network/timeout (either phase) | Retry up to 2x with backoff | Retry up to 2x with backoff | `failed` if exhausted |

**Key rules**:
- Each phase retries independently. Phase 2 never triggers a Phase 1 re-run.
- A successful Phase 1 result is always preserved — Phase 2 failure does not discard categories or trend_analysis.
- Digest is marked `failed` only when Phase 1 cannot produce valid output (both user and default prompts fail, or network exhaustion).
- If Phase 2 completely fails but Phase 1 succeeded, the digest completes with categories-only output (empty `headlines[]`).

| Additional Failure | Behavior |
|---------|----------|
| **Phase 1 returns invalid item_ids** | Silently drop unknown/duplicate IDs. If all headline IDs are invalid → skip Phase 2, output categories only. |
| **Phase 2 extra/unknown item_ids** | Silently drop. |
| **digest_prompt is empty/whitespace-only** | Treated same as null — use system default prompt. |
| **JSON parseable but schema-invalid** | ResponseValidator checks: all required keys present, correct types (string/array), non-empty `item_id` strings. Missing required keys or wrong types → treated as parse error (same fallback-to-default flow). Empty arrays are valid (e.g., 0 headlines). |
