import { describe, it, expect } from 'vitest';
import {
  validatePhase1Response,
  validatePhase2Response,
  deduplicatePhase1Result,
} from '../../src/digest/prompts/digest.validators';

describe('validatePhase1Response', () => {
  const validIds = new Set(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);

  it('accepts valid Phase 1 response and returns parsed result', () => {
    const json = JSON.stringify({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [{ topic: 'Tools', items: [{ item_id: 'id-2', one_liner: 'A tool update' }] }],
      trend_analysis: 'AI is trending.',
    });

    const result = validatePhase1Response(json, validIds);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
      expect(result.value.headlines[0].item_id).toBe('id-1');
      expect(result.value.categories).toHaveLength(1);
      expect(result.value.trend_analysis).toBe('AI is trending.');
    }
  });

  it('filters out headlines with unknown item_ids', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: 'id-1', topic: 'AI' },
        { item_id: 'unknown-id', topic: 'Bad' },
      ],
      categories: [],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
      expect(result.value.headlines[0].item_id).toBe('id-1');
    }
  });

  it('filters out category items with unknown item_ids', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [{ topic: 'Tools', items: [
        { item_id: 'id-2', one_liner: 'Valid' },
        { item_id: 'ghost', one_liner: 'Invalid' },
      ] }],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories[0].items).toHaveLength(1);
      expect(result.value.categories[0].items[0].item_id).toBe('id-2');
    }
  });

  it('removes empty categories after filtering', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [{ topic: 'Empty', items: [{ item_id: 'ghost', one_liner: 'Invalid' }] }],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories).toHaveLength(0);
    }
  });

  it('caps headlines at 10', () => {
    const headlines = Array.from({ length: 15 }, (_, i) => ({
      item_id: `id-${i + 1}`,
      topic: `Topic ${i + 1}`,
    }));
    // Need more valid IDs for this test
    const manyIds = new Set(headlines.map(h => h.item_id));

    const json = JSON.stringify({
      headlines,
      categories: [],
      trend_analysis: '',
    });

    const result = validatePhase1Response(json, manyIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(10);
      expect(result.droppedHeadlineCount).toBe(5);
    }
  });

  it('returns error for invalid JSON', () => {
    const result = validatePhase1Response('not json', validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when headlines is not an array', () => {
    const json = JSON.stringify({
      headlines: 'not an array',
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when categories is not an array', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: 'not an array',
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when trend_analysis is missing', () => {
    const json = JSON.stringify({ headlines: [], categories: [] });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(false);
  });

  it('filters headline items with empty item_id', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: '', topic: 'Empty ID' },
        { item_id: 'id-1', topic: 'Valid' },
      ],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(1);
    }
  });

  it('accepts empty arrays as valid', () => {
    const json = JSON.stringify({
      headlines: [],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
  });

  it('deduplicates item_ids within headlines array (keeps first occurrence)', () => {
    const json = JSON.stringify({
      headlines: [
        { item_id: 'id-1', topic: 'AI' },
        { item_id: 'id-1', topic: 'AI duplicate' },
        { item_id: 'id-2', topic: 'Tools' },
      ],
      categories: [],
      trend_analysis: '',
    });
    const result = validatePhase1Response(json, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headlines).toHaveLength(2);
      expect(result.value.headlines[0].topic).toBe('AI');
      expect(result.value.headlines[1].topic).toBe('Tools');
    }
  });
});

describe('validatePhase2Response', () => {
  const validHeadlineIds = new Set(['h-1', 'h-2', 'h-3']);

  it('accepts valid Phase 2 response', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Breaking: AI', analysis: 'Detailed analysis...' },
      { item_id: 'h-2', title: 'New Framework', analysis: 'Another analysis...' },
    ]);

    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('filters out items with unknown item_ids', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'unknown', title: 'Invalid', analysis: 'Bad' },
    ]);

    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('returns error for invalid JSON', () => {
    const result = validatePhase2Response('bad json', validHeadlineIds);
    expect(result.ok).toBe(false);
  });

  it('returns error when response is not an array', () => {
    const json = JSON.stringify({ item_id: 'h-1', title: 'Not array', analysis: 'Bad' });
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(false);
  });

  it('filters items with missing title or analysis', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'h-2', title: '', analysis: 'Missing title' },
      { item_id: 'h-3', analysis: 'Missing title key' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('accepts empty array as valid', () => {
    const json = JSON.stringify([]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('filters items with empty analysis', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'Valid', analysis: 'OK' },
      { item_id: 'h-2', title: 'Also Valid', analysis: '' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].item_id).toBe('h-1');
    }
  });

  it('deduplicates item_ids (first occurrence wins)', () => {
    const json = JSON.stringify([
      { item_id: 'h-1', title: 'First', analysis: 'Analysis 1' },
      { item_id: 'h-1', title: 'Duplicate', analysis: 'Analysis 2' },
      { item_id: 'h-2', title: 'Second', analysis: 'Analysis 3' },
    ]);
    const result = validatePhase2Response(json, validHeadlineIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].title).toBe('First');
      expect(result.value[1].item_id).toBe('h-2');
    }
  });
});

describe('deduplicatePhase1Result', () => {
  it('removes category items that appear in headlines', () => {
    const result = deduplicatePhase1Result({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [
        { topic: 'AI', items: [
          { item_id: 'id-1', one_liner: 'Dupe' },
          { item_id: 'id-2', one_liner: 'Unique' },
        ] },
      ],
      trend_analysis: '',
    });

    expect(result.categories[0].items).toHaveLength(1);
    expect(result.categories[0].items[0].item_id).toBe('id-2');
  });

  it('removes empty categories after dedup', () => {
    const result = deduplicatePhase1Result({
      headlines: [{ item_id: 'id-1', topic: 'AI' }],
      categories: [
        { topic: 'AI', items: [{ item_id: 'id-1', one_liner: 'Only dupe' }] },
      ],
      trend_analysis: '',
    });

    expect(result.categories).toHaveLength(0);
  });

  it('within categories, keeps first occurrence of duplicate item_id', () => {
    const result = deduplicatePhase1Result({
      headlines: [],
      categories: [
        { topic: 'A', items: [{ item_id: 'id-1', one_liner: 'First' }] },
        { topic: 'B', items: [{ item_id: 'id-1', one_liner: 'Second' }] },
      ],
      trend_analysis: '',
    });

    // id-1 should only appear in topic A (first occurrence)
    const allItemIds = result.categories.flatMap(c => c.items.map(i => i.item_id));
    expect(allItemIds.filter(id => id === 'id-1')).toHaveLength(1);
    expect(result.categories.find(c => c.topic === 'A')?.items[0].item_id).toBe('id-1');
  });

  it('does not modify headlines', () => {
    const result = deduplicatePhase1Result({
      headlines: [
        { item_id: 'id-1', topic: 'A' },
        { item_id: 'id-2', topic: 'B' },
      ],
      categories: [],
      trend_analysis: 'test',
    });

    expect(result.headlines).toHaveLength(2);
    expect(result.trend_analysis).toBe('test');
  });

  it('excludes ALL pre-cap headline IDs from categories (R2-8)', () => {
    const allHeadlineIds = Array.from({ length: 12 }, (_, i) => `id-${i + 1}`);
    const cappedResult = {
      headlines: allHeadlineIds.slice(0, 10).map(id => ({ item_id: id, topic: 'Topic' })),
      categories: [{
        topic: 'Misc',
        items: [
          { item_id: 'id-11', one_liner: 'Leaked headline 11' },
          { item_id: 'id-12', one_liner: 'Leaked headline 12' },
          { item_id: 'cat-1', one_liner: 'Genuine category item' },
        ],
      }],
      trend_analysis: '',
    };

    const deduped = deduplicatePhase1Result(cappedResult, allHeadlineIds);
    const categoryItemIds = deduped.categories.flatMap(c => c.items.map(i => i.item_id));
    expect(categoryItemIds).not.toContain('id-11');
    expect(categoryItemIds).not.toContain('id-12');
    expect(categoryItemIds).toContain('cat-1');
  });
});
