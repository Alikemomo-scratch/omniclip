import { describe, it, expect } from 'vitest';
import {
  buildMapPrompt,
  buildReducePrompt,
  buildSimpleSummaryPrompt,
  buildBatchMapPrompt,
  batchItems,
  type ContentItemForDigest,
  type ItemSummary,
} from '../../src/digest/prompts/digest.prompts';

// ── Helper factories ──

function buildItem(overrides: Partial<ContentItemForDigest> = {}): ContentItemForDigest {
  return {
    id: 'item-001',
    platform: 'github',
    content_type: 'release',
    title: 'v1.0.0 Released',
    body: 'Major release with new features and bug fixes.',
    author_name: 'dev-user',
    original_url: 'https://github.com/repo/releases/v1.0.0',
    published_at: '2026-03-10T08:00:00Z',
    metadata: {},
    ...overrides,
  };
}

function buildSummary(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    id: 'item-001',
    platform: 'github',
    summary: 'A new major version was released with breaking changes.',
    ...overrides,
  };
}

// ── buildMapPrompt ──

describe('buildMapPrompt', () => {
  it('includes platform, type, title, author, and body', () => {
    const item = buildItem();
    const prompt = buildMapPrompt(item, 'en');

    expect(prompt).toContain('Platform: github');
    expect(prompt).toContain('Type: release');
    expect(prompt).toContain('Title: v1.0.0 Released');
    expect(prompt).toContain('Author: dev-user');
    expect(prompt).toContain('Content: Major release');
    expect(prompt).toContain('respond in en');
  });

  it('uses Chinese instruction when language is zh', () => {
    const item = buildItem();
    const prompt = buildMapPrompt(item, 'zh');

    expect(prompt).toContain('中文');
  });

  it('omits title/body/author when null', () => {
    const item = buildItem({ title: null, body: null, author_name: null });
    const prompt = buildMapPrompt(item, 'en');

    expect(prompt).not.toContain('Title:');
    expect(prompt).not.toContain('Content:');
    expect(prompt).not.toContain('Author:');
  });

  it('truncates long body to 2000 chars', () => {
    const longBody = 'a'.repeat(3000);
    const item = buildItem({ body: longBody });
    const prompt = buildMapPrompt(item, 'en');

    // Should contain truncated body (2000 chars + '...')
    expect(prompt).toContain('a'.repeat(2000) + '...');
    expect(prompt).not.toContain('a'.repeat(2001));
  });

  it('includes metadata like view_count, stars, tags', () => {
    const item = buildItem({
      metadata: {
        view_count: 50000,
        stars: 1234,
        tags: ['typescript', 'webdev'],
      },
    });
    const prompt = buildMapPrompt(item, 'en');

    expect(prompt).toContain('Views: 50000');
    expect(prompt).toContain('Stars: 1234');
    expect(prompt).toContain('Tags: typescript, webdev');
  });

  it('skips metadata section when metadata is empty', () => {
    const item = buildItem({ metadata: {} });
    const prompt = buildMapPrompt(item, 'en');

    expect(prompt).not.toContain('Metadata:');
  });
});

// ── buildReducePrompt ──

describe('buildReducePrompt', () => {
  it('includes all summaries with IDs and platforms', () => {
    const summaries = [
      buildSummary({ id: 'id-1', platform: 'github', summary: 'GitHub release summary' }),
      buildSummary({ id: 'id-2', platform: 'youtube', summary: 'YouTube video summary' }),
    ];
    const prompt = buildReducePrompt(summaries, 'en');

    expect(prompt).toContain('2 content item summaries');
    expect(prompt).toContain('id: id-1, platform: github');
    expect(prompt).toContain('GitHub release summary');
    expect(prompt).toContain('id: id-2, platform: youtube');
    expect(prompt).toContain('YouTube video summary');
  });

  it('requests JSON output format with topic_groups and trend_analysis', () => {
    const summaries = [buildSummary()];
    const prompt = buildReducePrompt(summaries, 'en');

    expect(prompt).toContain('"topic_groups"');
    expect(prompt).toContain('"trend_analysis"');
    expect(prompt).toContain('"item_ids"');
    expect(prompt).toContain('"platforms"');
  });

  it('uses correct language instruction', () => {
    const summaries = [buildSummary()];

    const zhPrompt = buildReducePrompt(summaries, 'zh');
    expect(zhPrompt).toContain('中文');

    const enPrompt = buildReducePrompt(summaries, 'en');
    expect(enPrompt).toContain('respond in en');
  });
});

// ── buildSimpleSummaryPrompt ──

describe('buildSimpleSummaryPrompt', () => {
  it('includes all items with IDs and platforms', () => {
    const items = [
      buildItem({ id: 'a1', platform: 'github', title: 'Release A' }),
      buildItem({ id: 'a2', platform: 'twitter', title: 'Tweet B' }),
    ];
    const prompt = buildSimpleSummaryPrompt(items, 'en');

    expect(prompt).toContain('2 content items');
    expect(prompt).toContain('id: a1, platform: github');
    expect(prompt).toContain('Release A');
    expect(prompt).toContain('id: a2, platform: twitter');
    expect(prompt).toContain('Tweet B');
  });

  it('truncates body to 1000 chars', () => {
    const longBody = 'b'.repeat(1500);
    const items = [buildItem({ body: longBody })];
    const prompt = buildSimpleSummaryPrompt(items, 'en');

    expect(prompt).toContain('b'.repeat(1000) + '...');
    expect(prompt).not.toContain('b'.repeat(1001));
  });

  it('requests JSON format with topic_groups', () => {
    const items = [buildItem()];
    const prompt = buildSimpleSummaryPrompt(items, 'en');

    expect(prompt).toContain('"topic_groups"');
  });
});

// ── buildBatchMapPrompt ──

describe('buildBatchMapPrompt', () => {
  it('includes all items in a single prompt', () => {
    const items = [
      buildItem({ id: 'b1', title: 'Item One' }),
      buildItem({ id: 'b2', title: 'Item Two' }),
      buildItem({ id: 'b3', title: 'Item Three' }),
    ];
    const prompt = buildBatchMapPrompt(items, 'en');

    expect(prompt).toContain('Item One');
    expect(prompt).toContain('Item Two');
    expect(prompt).toContain('Item Three');
    expect(prompt).toContain('id: b1');
    expect(prompt).toContain('id: b2');
    expect(prompt).toContain('id: b3');
  });

  it('truncates body to 1000 chars per item', () => {
    const longBody = 'c'.repeat(1500);
    const items = [buildItem({ body: longBody })];
    const prompt = buildBatchMapPrompt(items, 'en');

    expect(prompt).toContain('c'.repeat(1000) + '...');
  });

  it('requests JSON array format with id and summary', () => {
    const items = [buildItem()];
    const prompt = buildBatchMapPrompt(items, 'en');

    expect(prompt).toContain('"id"');
    expect(prompt).toContain('"summary"');
  });
});

// ── batchItems ──

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
