import { describe, expect, it } from 'vitest';
import { pickLatestWeekId } from './latestWeek';
import type { WeekRow } from '../types/db';

function week(overrides: Partial<WeekRow>): WeekRow {
  return {
    id: 'w1',
    year_no: 2026,
    week_no: 36,
    label: 'WK36',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('pickLatestWeekId', () => {
  it('picks the week of the most recently uploaded file', () => {
    const weeks = [week({ id: 'w2', label: 'WK37' }), week({ id: 'w1', label: 'WK36' })];
    const stamps = [
      { week_id: 'w1', timestamp: '2026-09-04T13:25:00Z' },
      { week_id: 'w2', timestamp: '2026-08-28T10:00:00Z' },
    ];
    expect(pickLatestWeekId(weeks, stamps)).toBe('w1');
  });

  it('falls back to the newest week (weeks[0]) when there is no upload activity yet', () => {
    const weeks = [week({ id: 'w2', label: 'WK37' }), week({ id: 'w1', label: 'WK36' })];
    expect(pickLatestWeekId(weeks, [])).toBe('w2');
  });

  it('returns null when there are no weeks at all', () => {
    expect(pickLatestWeekId([], [])).toBeNull();
  });

  it('prefers a week with real upload activity over a stray higher-numbered empty week', () => {
    // Regression: a test/mistake week like "WK34 (2029)" with zero files must
    // never outrank a week that actually has processed data, just because its
    // (year_no, week_no) sorts higher.
    const weeks = [week({ id: 'empty', year_no: 2029, week_no: 34 }), week({ id: 'real', year_no: 2026, week_no: 36 })];
    const stamps = [{ week_id: 'real', timestamp: '2026-09-02T20:56:54Z' }];
    expect(pickLatestWeekId(weeks, stamps)).toBe('real');
  });
});
