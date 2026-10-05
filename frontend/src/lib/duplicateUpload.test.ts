import { describe, expect, it } from 'vitest';
import { actualRowFingerprint, findDuplicateFile, looksTruncated, overlapRatio } from './duplicateUpload';

describe('overlapRatio', () => {
  it('counts repeated identical rows as a multiset', () => {
    expect(overlapRatio(['a', 'a', 'b'], ['a'])).toBeCloseTo(1 / 3, 10);
    expect(overlapRatio(['a', 'a', 'b'], ['a', 'a', 'b'])).toBe(1);
    expect(overlapRatio([], ['a'])).toBe(0);
  });
});

describe('findDuplicateFile', () => {
  it('flags a re-upload of the same rows under another name, but not a disjoint split file', () => {
    const existing = new Map([
      ['file-1', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']],
      ['file-2', ['x', 'y']],
    ]);
    expect(findDuplicateFile(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], existing)).toEqual({ fileId: 'file-1', ratio: 1 });
    expect(findDuplicateFile(['p', 'q', 'r'], existing)).toBeNull();
  });
});

describe('actualRowFingerprint', () => {
  it('treats a numeric-string weight from the database the same as a parsed number', () => {
    const base = { transfer_date: '2026-08-31', origin_code: 'O', dest_code: 'D', sku_code: 'S' };
    expect(actualRowFingerprint({ ...base, weight_kg: '15.0' })).toBe(actualRowFingerprint({ ...base, weight_kg: 15 }));
  });
});

describe('looksTruncated', () => {
  it('flags exactly the 5,000-row export cap', () => {
    expect(looksTruncated(5000)).toBe(true);
    expect(looksTruncated(4999)).toBe(false);
  });
});
