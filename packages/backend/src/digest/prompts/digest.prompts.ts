/**
 * Prompt templates for the AI digest pipeline.
 *
 * Pipeline:
 * 1. MAP: Summarize each content item individually
 * 2. GROUP: Cluster summaries by topic
 * 3. REDUCE: Generate topic group summaries + cross-platform trend analysis
 */

export interface ContentItemForDigest {
  id: string;
  platform: string;
  content_type: string;
  title: string | null;
  body: string | null;
  author_name: string | null;
  original_url: string;
  published_at: string;
  metadata: Record<string, unknown>;
}

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

/**
 * Batch items into groups of the given size.
 */
export function batchItems<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

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

// ── Digest Customization Types & Constants ──

/**
 * Placeholder one_liner assigned to headlines demoted to categories by the validator.
 * The generateDigest pipeline replaces this with the source content item's title.
 */
export const DEMOTED_HEADLINE_PLACEHOLDER = '(Demoted from headlines)';

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

export interface DigestConfig {
  mode: 'structured' | 'raw';
  selectedTopics: string[];
  customTopics: string[];
  headlineCount: number;
}

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  mode: 'structured',
  selectedTopics: ['ai-ml', 'crypto', 'programming', 'startup-vc'],
  customTopics: [],
  headlineCount: 5,
};

/**
 * Sanitize digest_config from DB or API. Pure function, no exceptions.
 * Used on both API write (DTO) and DB read (digest generation).
 */
export function normalizeDigestConfig(input: unknown): DigestConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_DIGEST_CONFIG };
  }

  const raw = input as Record<string, unknown>;

  const mode: DigestConfig['mode'] = raw.mode === 'raw' ? 'raw' : 'structured';

  const validTopicIds = new Set(PRESET_TOPICS.map((t) => t.id));
  let selectedTopics: string[];
  if (Array.isArray(raw.selectedTopics)) {
    selectedTopics = [
      ...new Set(
        (raw.selectedTopics as unknown[]).filter(
          (v): v is string => typeof v === 'string' && validTopicIds.has(v),
        ),
      ),
    ];
  } else {
    selectedTopics = [...DEFAULT_DIGEST_CONFIG.selectedTopics];
  }

  let customTopics: string[];
  if (Array.isArray(raw.customTopics)) {
    customTopics = [
      ...new Set(
        (raw.customTopics as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 100)),
      ),
    ].slice(0, 20);
  } else {
    customTopics = [];
  }

  // Only fall back to default selectedTopics when BOTH are empty.
  // This allows users to deselect all presets while using only custom topics.
  if (selectedTopics.length === 0 && customTopics.length === 0) {
    selectedTopics = [...DEFAULT_DIGEST_CONFIG.selectedTopics];
  }

  const headlineCount =
    typeof raw.headlineCount === 'number' &&
    Number.isInteger(raw.headlineCount) &&
    raw.headlineCount >= 1 &&
    raw.headlineCount <= 10
      ? raw.headlineCount
      : DEFAULT_DIGEST_CONFIG.headlineCount;

  return { mode, selectedTopics, customTopics, headlineCount };
}

/**
 * Generate Phase 1 prompt from structured config.
 * Input MUST be pre-normalized via normalizeDigestConfig.
 */
export function buildPhase1PromptFromConfig(config: DigestConfig): string {
  const allTopics = [
    ...PRESET_TOPICS.filter((t) => config.selectedTopics.includes(t.id)).map((t) => t.label),
    ...config.customTopics,
  ];

  const topicList =
    allTopics.length > 0
      ? allTopics.map((t) => `- ${t}`).join('\n')
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
