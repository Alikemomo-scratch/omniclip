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
    expect(result[0]).toContain('[1] github/release | 2026-03-10T08:00:00Z');
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
    expect(result[0]).toContain('[1]');
    expect(result[1]).toContain('[2]');
    expect(result[2]).toContain('[3]');
    expect(result[0]).toContain('github/release');
    expect(result[0]).not.toContain('id:');
  });
});
