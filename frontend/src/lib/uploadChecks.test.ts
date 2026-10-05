import { describe, expect, it } from 'vitest';
import { checkDatesInWeek, findOverlappingDates, isoWeekRange } from './uploadChecks';

describe('isoWeekRange', () => {
  it('matches the real sample weeks (WK35/WK36 2026)', () => {
    expect(isoWeekRange(2026, 36)).toEqual({ start: '2026-08-31', end: '2026-09-06' });
    expect(isoWeekRange(2026, 35)).toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('handles weeks that cross a year boundary', () => {
    expect(isoWeekRange(2026, 1)).toEqual({ start: '2025-12-29', end: '2026-01-04' });
    expect(isoWeekRange(2020, 53)).toEqual({ start: '2020-12-28', end: '2021-01-03' });
  });
});

describe('checkDatesInWeek', () => {
  const wk36 = isoWeekRange(2026, 36);

  it('accepts dates inside the week and one day either side', () => {
    const check = checkDatesInWeek(['2026-08-30', '2026-08-31', '2026-09-06', '2026-09-07'], wk36);
    expect(check.outsideRowCount).toBe(0);
    expect(check.looksLikeOtherWeek).toBe(false);
  });

  it('flags a file from another week', () => {
    const check = checkDatesInWeek(['2026-08-24', '2026-08-25', '2026-08-26'], wk36);
    expect(check.looksLikeOtherWeek).toBe(true);
    expect(check.outsideDates).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
  });

  it('reports stray dates without calling the whole file another week', () => {
    const check = checkDatesInWeek(['2026-08-31', '2026-09-01', '2026-09-20'], wk36);
    expect(check.outsideDates).toEqual(['2026-09-20']);
    expect(check.looksLikeOtherWeek).toBe(false);
  });
});

describe('findOverlappingDates', () => {
  it('finds plan dates already covered by another file', () => {
    const existing = new Map([
      ['file-a', new Set(['2026-08-31', '2026-09-01'])],
      ['file-b', new Set(['2026-09-02'])],
    ]);
    const overlaps = findOverlappingDates(['2026-08-31', '2026-08-31', '2026-09-03'], existing);
    expect(overlaps).toEqual(new Map([['file-a', ['2026-08-31']]]));
  });
});
