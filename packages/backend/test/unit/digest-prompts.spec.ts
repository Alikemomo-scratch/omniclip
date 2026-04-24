import { describe, it, expect } from 'vitest';
import { batchItems } from '../../src/digest/prompts/digest.prompts';

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
