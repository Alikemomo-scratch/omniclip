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
