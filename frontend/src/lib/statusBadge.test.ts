import { describe, expect, it } from 'vitest';
import { computeStatus, type StatusThresholds } from './statusBadge';

const thresholds: StatusThresholds = {
  highPct: 1.0,
  lowPct: 0.9,
  highColor: 'green',
  midColor: 'amber',
  lowColor: 'red',
};

describe('computeStatus', () => {
  it('is "none"/gray when there is no plan (pct is null)', () => {
    expect(computeStatus(null, thresholds)).toEqual({ zone: 'none', color: 'gray', label: 'ไม่มีแผน' });
  });

  it('is the high zone at or above the high threshold', () => {
    expect(computeStatus(1, thresholds).zone).toBe('high');
    expect(computeStatus(1.5, thresholds).zone).toBe('high'); // total_pct never actually exceeds 1 in practice, but the function shouldn't assume that
  });

  it('is the mid zone between the two thresholds', () => {
    expect(computeStatus(0.95, thresholds).zone).toBe('mid');
    expect(computeStatus(0.9, thresholds).zone).toBe('mid');
  });

  it('is the low zone below the low threshold', () => {
    expect(computeStatus(0.89, thresholds).zone).toBe('low');
    expect(computeStatus(0, thresholds).zone).toBe('low');
  });

  it('respects admin-configured colors, not hardcoded ones', () => {
    const custom: StatusThresholds = { ...thresholds, highColor: 'navy', midColor: 'blue', lowColor: 'gray' };
    expect(computeStatus(1, custom).color).toBe('navy');
    expect(computeStatus(0.95, custom).color).toBe('blue');
    expect(computeStatus(0.5, custom).color).toBe('gray');
  });
});
