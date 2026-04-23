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
- `headlines`: Item IDs flagged as important (to be deep-dived in Phase 2)
- `categories`: Grouped minor items, each with a one-liner summary
- `trend_analysis`: Cross-platform trend paragraph

**Output**: Structured JSON with headline IDs + categorized minor items.

### Phase 2: Headline Deep Dive

**Input**: Only the items flagged as headlines — with **full original content** (body up to 3000 chars).

**LLM task**: Write detailed newspaper-style analysis for each headline item.

**Output**: Array of headline objects with title, analysis, platform, URL.

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

### Output JSON Structure

```typescript
interface DigestOutput {
  headlines: {
    item_id: string;
    topic: string;
    title: string;
    analysis: string;
    platform: string;
    original_url: string;
  }[];

  categories: {
    topic: string;
    items: {
      item_id: string;
      one_liner: string;
      platform: string;
      original_url: string;
    }[];
  }[];

  trend_analysis: string;
}
```

This replaces the existing `topic_groups` JSONB field. The column is reused (same `topic_groups` jsonb column) but stores the new shape. Frontend must handle both old and new shapes for backward compatibility with existing digests.

### Pipeline Execution

```
generateDigest(userId, digestType, periodStart, periodEnd, language)
  1. Create pending digest record
  2. Fetch user's digest_prompt (or use default)
  3. Split prompt by ---PHASE_SEPARATOR---
  4. Fetch content_items for the time period
  5. Format all items in standardized summary format (500 char body)
  6. Phase 1: userPromptPart1 + formatted summaries + JSON schema → LLM
     → Parse response: headline IDs + categories + trend_analysis
  7. Fetch full content for headline items (3000 char body)
  8. Phase 2: userPromptPart2 + full headline content + JSON schema → LLM
     → Parse response: headline analyses
  9. Merge Phase 1 + Phase 2 into DigestOutput
  10. Save to digest record, link content items via digest_items
```

If the prompt has no `---PHASE_SEPARATOR---`, the entire prompt is used for Phase 1 only, and Phase 2 uses a hardcoded default deep-dive prompt.

### Affected Components

**Database**:
- `users` table: Add `digest_prompt` text column (nullable)
- Migration: `0003_add_digest_prompt.sql`

**Backend**:
- `digest.service.ts`: Rewrite `generateDigest`, `generateMapReduceDigest`, `generateSimpleDigest` → new two-phase pipeline
- `prompts/digest.prompts.ts`: Rewrite all prompt builders; add default prompt template, standardized content formatter, JSON schema instructions
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

- **No content items**: Skip LLM calls, save empty digest with status `completed` and item_count 0.
- **<5 items**: Still run both phases (Phase 1 may flag 0-2 headlines).
- **Phase 1 flags 0 headlines**: Skip Phase 2, output only categories + trend_analysis.
- **Invalid user prompt**: Catch LLM parse errors, fall back to default prompt, retry once.
- **Missing PHASE_SEPARATOR**: Use entire prompt for Phase 1, default prompt for Phase 2.
