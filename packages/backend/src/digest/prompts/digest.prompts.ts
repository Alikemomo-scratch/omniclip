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
 * Build the MAP prompt: summarize a single content item.
 */
export function buildMapPrompt(item: ContentItemForDigest, language: string): string {
  const langInstruction =
    language === 'zh' ? 'Please respond in Chinese (中文).' : `Please respond in ${language}.`;

  const parts = [`Summarize the following content item in 1-2 sentences. ${langInstruction}`];
  parts.push('');
  parts.push(`Platform: ${item.platform}`);
  parts.push(`Type: ${item.content_type}`);
  if (item.title) parts.push(`Title: ${item.title}`);
  if (item.author_name) parts.push(`Author: ${item.author_name}`);
  if (item.body) {
    // Truncate body to avoid exceeding token limits
    const truncated = item.body.length > 2000 ? item.body.slice(0, 2000) + '...' : item.body;
    parts.push(`Content: ${truncated}`);
  }
  if (item.metadata && Object.keys(item.metadata).length > 0) {
    // Include selected metadata
    const meta: string[] = [];
    if ('view_count' in item.metadata) meta.push(`Views: ${item.metadata.view_count}`);
    if ('like_count' in item.metadata) meta.push(`Likes: ${item.metadata.like_count}`);
    if ('likeCount' in item.metadata) meta.push(`Likes: ${item.metadata.likeCount}`);
    if ('retweetCount' in item.metadata) meta.push(`Retweets: ${item.metadata.retweetCount}`);
    if ('replyCount' in item.metadata) meta.push(`Replies: ${item.metadata.replyCount}`);
    if ('stars' in item.metadata) meta.push(`Stars: ${item.metadata.stars}`);
    if ('likes' in item.metadata) meta.push(`Likes: ${item.metadata.likes}`);
    if ('tags' in item.metadata) meta.push(`Tags: ${(item.metadata.tags as string[]).join(', ')}`);
    if (meta.length > 0) parts.push(`Metadata: ${meta.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Build the GROUP + REDUCE prompt: cluster summaries into topics and analyze trends.
 */
export function buildReducePrompt(
  summaries: Array<{ id: string; platform: string; summary: string }>,
  language: string,
): string {
  const langInstruction =
    language === 'zh' ? 'Please respond in Chinese (中文).' : `Please respond in ${language}.`;

  const summaryLines = summaries.map(
    (s, i) => `[${i + 1}] (id: ${s.id}, platform: ${s.platform}) ${s.summary}`,
  );

  return `You are an expert tech curator and analyst. Given the following ${summaries.length} high-signal content items (e.g. major open-source releases, new videos, and creator updates) from multiple platforms, do the following:

1. Group them by overarching topic or theme (e.g., "AI & LLMs", "Frontend Development", "Productivity Tools").
2. For each group, write a concise but highly informative summary that captures the essence of the updates, specifically highlighting new features, product launches, or core arguments.
3. Write a brief cross-platform trend analysis paragraph identifying any broader movements or recurring topics across the ecosystem.

${langInstruction}

Content Summaries:
${summaryLines.join('\n')}

Respond in this exact JSON format (no markdown, no code fences):
{
  "topic_groups": [
    {
      "topic": "Topic Name",
      "summary": "Group summary detailing key updates...",
      "item_ids": ["id1", "id2"],
      "platforms": ["github", "youtube"]
    }
  ],
  "trend_analysis": "Cross-platform trend analysis..."
}`;
}

/**
 * Build a prompt for the simple case: <5 items, just individual summaries.
 */
export function buildSimpleSummaryPrompt(items: ContentItemForDigest[], language: string): string {
  const langInstruction =
    language === 'zh' ? 'Please respond in Chinese (中文).' : `Please respond in ${language}.`;

  const itemLines = items.map((item, i) => {
    const parts = [`[${i + 1}] (id: ${item.id}, platform: ${item.platform})`];
    if (item.title) parts.push(`Title: ${item.title}`);
    if (item.body) {
      const truncated = item.body.length > 1000 ? item.body.slice(0, 1000) + '...' : item.body;
      parts.push(`Content: ${truncated}`);
    }
    return parts.join('\n');
  });

  return `You are an expert tech curator. Summarize each of the following ${items.length} high-signal content items individually. Focus on extracting the core value (new features, key takeaways, announcements). ${langInstruction}

${itemLines.join('\n\n')}

Respond in this exact JSON format (no markdown, no code fences):
{
  "topic_groups": [
    {
      "topic": "Individual Summaries",
      "summary": "Detailed summary of all items highlighting their core value...",
      "item_ids": ["id1", "id2"],
      "platforms": ["platform1"]
    }
  ],
  "trend_analysis": ""
}`;
}

/**
 * Batch items for the MAP phase to reduce API calls.
 * Groups items into batches of the given size.
 */
export function batchItems<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Build a batch MAP prompt: summarize multiple items in one call.
 */
export function buildBatchMapPrompt(items: ContentItemForDigest[], language: string): string {
  const langInstruction =
    language === 'zh' ? 'Please respond in Chinese (中文).' : `Please respond in ${language}.`;

  const itemLines = items.map((item, i) => {
    const parts = [
      `[${i + 1}] (id: ${item.id}, platform: ${item.platform}, type: ${item.content_type})`,
    ];
    if (item.title) parts.push(`  Title: ${item.title}`);
    if (item.author_name) parts.push(`  Author: ${item.author_name}`);
    if (item.body) {
      const truncated = item.body.length > 1000 ? item.body.slice(0, 1000) + '...' : item.body;
      parts.push(`  Content: ${truncated}`);
    }
    return parts.join('\n');
  });

  return `Summarize each of the following content items in 1-3 sentences each. Focus heavily on extracting the core signal: for releases, what are the major new features? For videos/posts, what is the main takeaway or thesis? ${langInstruction}

${itemLines.join('\n\n')}

Respond in this exact JSON format (no markdown, no code fences):
[
  { "id": "item_id", "summary": "1-3 sentence detailed summary extracting key features/takeaways" }
]`;
}
