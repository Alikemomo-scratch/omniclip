import { describe, it, expect } from 'vitest';
import {
  normalizeDigestConfig,
  DEFAULT_DIGEST_CONFIG,
  PRESET_TOPICS,
} from '../../src/digest/prompts/digest.prompts';

describe('normalizeDigestConfig', () => {
  it('returns default config for null input', () => {
    expect(normalizeDigestConfig(null)).toEqual(DEFAULT_DIGEST_CONFIG);
  });

  it('returns default config for undefined input', () => {
    expect(normalizeDigestConfig(undefined)).toEqual(DEFAULT_DIGEST_CONFIG);
  });

  it('returns default config for non-object input', () => {
    expect(normalizeDigestConfig('string')).toEqual(DEFAULT_DIGEST_CONFIG);
    expect(normalizeDigestConfig(42)).toEqual(DEFAULT_DIGEST_CONFIG);
    expect(normalizeDigestConfig([])).toEqual(DEFAULT_DIGEST_CONFIG);
  });

  it('preserves valid structured config', () => {
    const input = {
      mode: 'structured',
      selectedTopics: ['ai-ml', 'crypto'],
      customTopics: ['DeFi Safety'],
      headlineCount: 3,
      summaryCount: 20,
    };
    expect(normalizeDigestConfig(input)).toEqual(input);
  });

  it('preserves raw mode', () => {
    const result = normalizeDigestConfig({ mode: 'raw' });
    expect(result.mode).toBe('raw');
  });

  it('defaults invalid mode to structured', () => {
    expect(normalizeDigestConfig({ mode: 'invalid' }).mode).toBe('structured');
    expect(normalizeDigestConfig({ mode: 123 }).mode).toBe('structured');
  });

  it('filters unknown topic IDs from selectedTopics', () => {
    const result = normalizeDigestConfig({
      selectedTopics: ['ai-ml', 'bogus-topic', 'crypto'],
    });
    expect(result.selectedTopics).toEqual(['ai-ml', 'crypto']);
  });

  it('uses default selectedTopics when all are invalid', () => {
    const result = normalizeDigestConfig({
      selectedTopics: ['bogus1', 'bogus2'],
    });
    expect(result.selectedTopics).toEqual(DEFAULT_DIGEST_CONFIG.selectedTopics);
  });

  it('deduplicates selectedTopics', () => {
    const result = normalizeDigestConfig({
      selectedTopics: ['ai-ml', 'ai-ml', 'crypto'],
    });
    expect(result.selectedTopics).toEqual(['ai-ml', 'crypto']);
  });

  it('trims and deduplicates customTopics', () => {
    const result = normalizeDigestConfig({
      customTopics: ['  DeFi  ', 'DeFi', 'NFT Art'],
    });
    expect(result.customTopics).toEqual(['DeFi', 'NFT Art']);
  });

  it('filters empty and whitespace-only customTopics', () => {
    const result = normalizeDigestConfig({
      customTopics: ['', '   ', 'Valid'],
    });
    expect(result.customTopics).toEqual(['Valid']);
  });

  it('caps customTopics at 100 chars each', () => {
    const longTopic = 'x'.repeat(200);
    const result = normalizeDigestConfig({
      customTopics: [longTopic],
    });
    expect(result.customTopics[0].length).toBe(100);
  });

  it('caps customTopics at 20 items', () => {
    const topics = Array.from({ length: 25 }, (_, i) => `Topic ${i}`);
    const result = normalizeDigestConfig({ customTopics: topics });
    expect(result.customTopics.length).toBe(20);
  });

  it('clamps headlineCount below 1 to default', () => {
    expect(normalizeDigestConfig({ headlineCount: 0 }).headlineCount).toBe(
      DEFAULT_DIGEST_CONFIG.headlineCount,
    );
    expect(normalizeDigestConfig({ headlineCount: -5 }).headlineCount).toBe(
      DEFAULT_DIGEST_CONFIG.headlineCount,
    );
  });

  it('clamps headlineCount above 10 to default', () => {
    expect(normalizeDigestConfig({ headlineCount: 11 }).headlineCount).toBe(
      DEFAULT_DIGEST_CONFIG.headlineCount,
    );
  });

  it('defaults non-integer headlineCount', () => {
    expect(normalizeDigestConfig({ headlineCount: 3.5 }).headlineCount).toBe(
      DEFAULT_DIGEST_CONFIG.headlineCount,
    );
    expect(normalizeDigestConfig({ headlineCount: 'five' }).headlineCount).toBe(
      DEFAULT_DIGEST_CONFIG.headlineCount,
    );
  });

  it('preserves valid headlineCount boundary values', () => {
    expect(normalizeDigestConfig({ headlineCount: 1 }).headlineCount).toBe(1);
    expect(normalizeDigestConfig({ headlineCount: 10 }).headlineCount).toBe(10);
  });

  it('clamps summaryCount below 5 to default', () => {
    expect(normalizeDigestConfig({ summaryCount: 4 }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
    expect(normalizeDigestConfig({ summaryCount: 0 }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
    expect(normalizeDigestConfig({ summaryCount: -1 }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
  });

  it('clamps summaryCount above 50 to default', () => {
    expect(normalizeDigestConfig({ summaryCount: 51 }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
  });

  it('defaults non-integer summaryCount', () => {
    expect(normalizeDigestConfig({ summaryCount: 10.5 }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
    expect(normalizeDigestConfig({ summaryCount: 'twenty' }).summaryCount).toBe(
      DEFAULT_DIGEST_CONFIG.summaryCount,
    );
  });

  it('preserves valid summaryCount boundary values', () => {
    expect(normalizeDigestConfig({ summaryCount: 5 }).summaryCount).toBe(5);
    expect(normalizeDigestConfig({ summaryCount: 50 }).summaryCount).toBe(50);
    expect(normalizeDigestConfig({ summaryCount: 30 }).summaryCount).toBe(30);
  });

  it('defaults non-array selectedTopics', () => {
    const result = normalizeDigestConfig({ selectedTopics: 'ai-ml' });
    expect(result.selectedTopics).toEqual(DEFAULT_DIGEST_CONFIG.selectedTopics);
  });

  it('defaults non-array customTopics', () => {
    const result = normalizeDigestConfig({ customTopics: 'DeFi' });
    expect(result.customTopics).toEqual([]);
  });

  it('allows empty selectedTopics when customTopics is non-empty', () => {
    const result = normalizeDigestConfig({
      selectedTopics: [],
      customTopics: ['Custom Topic'],
    });
    expect(result.selectedTopics).toEqual([]);
  });

  it('allows empty selectedTopics with invalid IDs when customTopics is non-empty', () => {
    const result = normalizeDigestConfig({
      selectedTopics: ['bogus1'],
      customTopics: ['Custom Topic'],
    });
    expect(result.selectedTopics).toEqual([]);
  });
});
