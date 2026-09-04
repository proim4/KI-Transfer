import { describe, expect, it } from 'vitest';
import { formatFileSize, groupHistoryByWeek, isCurrentVersion, nextVersion } from './uploadHistory';
import type { UploadHistoryRow, WeekRow } from '../types/db';

function historyRow(overrides: Partial<UploadHistoryRow>): UploadHistoryRow {
  return {
    id: 'h1',
    week_id: 'week-1',
    file_type: 'actual_abs0000',
    version: 1,
    original_filename: 'ABS0000.xls',
    file_size: 1024,
    storage_path: 'week-1/actual_abs0000/1_ABS0000.xls',
    row_count: 10,
    skipped_count: 0,
    status: 'validated',
    error_report: null,
    created_at: '2026-09-04T06:20:00Z',
    ...overrides,
  };
}

describe('nextVersion', () => {
  it('starts at 1 for an empty slot', () => {
    expect(nextVersion([])).toBe(1);
  });

  it('increments from the highest existing version', () => {
    expect(nextVersion([1, 2, 3])).toBe(4);
    expect(nextVersion([1, 3])).toBe(4);
  });
});

describe('isCurrentVersion', () => {
  it('flags only the highest-version row in the slot as current', () => {
    const rows = [historyRow({ id: 'a', version: 1 }), historyRow({ id: 'b', version: 2 })];
    expect(isCurrentVersion(rows[0], rows)).toBe(false);
    expect(isCurrentVersion(rows[1], rows)).toBe(true);
  });

  it('treats a lone row as current', () => {
    const rows = [historyRow({ id: 'a', version: 1 })];
    expect(isCurrentVersion(rows[0], rows)).toBe(true);
  });
});

function week(overrides: Partial<WeekRow>): WeekRow {
  return {
    id: 'w1',
    year_no: 2026,
    week_no: 36,
    label: 'WK36',
    product_line: 'chicken',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupHistoryByWeek', () => {
  const weeks = [week({ id: 'w1', label: 'WK36' }), week({ id: 'w2', label: 'WK37' })];

  it('counts only each slot\'s current validated file, not every historical attempt', () => {
    const rows = [
      historyRow({ id: 'a', week_id: 'w1', file_type: 'actual_abs0000', version: 1, created_at: '2026-09-01T10:00:00Z' }),
      historyRow({ id: 'b', week_id: 'w1', file_type: 'actual_abs0000', version: 2, created_at: '2026-09-02T10:00:00Z' }),
      historyRow({ id: 'c', week_id: 'w1', file_type: 'plan_weekly_bsr030', version: 1, created_at: '2026-09-02T11:00:00Z' }),
    ];
    const summary = groupHistoryByWeek(rows, weeks).find((s) => s.weekId === 'w1');
    expect(summary?.fileCount).toBe(2); // 1 current actual (v2, v1 superseded) + 1 plan_weekly, not 3
    expect(summary?.lastUpdated).toBe('2026-09-02T11:00:00Z');
  });

  it('excludes a slot whose current attempt errored', () => {
    const rows = [
      historyRow({ id: 'a', week_id: 'w1', file_type: 'actual_abs0000', version: 1, status: 'error' }),
    ];
    expect(groupHistoryByWeek(rows, weeks)[0].fileCount).toBe(0);
  });

  it('sorts weeks by most-recently-updated first', () => {
    const rows = [
      historyRow({ id: 'a', week_id: 'w1', created_at: '2026-08-28T10:00:00Z' }),
      historyRow({ id: 'b', week_id: 'w2', created_at: '2026-09-04T13:25:00Z' }),
    ];
    const summaries = groupHistoryByWeek(rows, weeks);
    expect(summaries.map((s) => s.weekId)).toEqual(['w2', 'w1']);
  });

  it('excludes history for a week outside the given list (e.g. a different product line)', () => {
    // rows is fetched globally across every product line; a pork-only weeks
    // list must not surface a chicken week's history.
    const rows = [
      historyRow({ id: 'a', week_id: 'w1' }),
      historyRow({ id: 'b', week_id: 'chicken-only-week' }),
    ];
    const summaries = groupHistoryByWeek(rows, weeks);
    expect(summaries.map((s) => s.weekId)).toEqual(['w1']);
  });
});

describe('formatFileSize', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('handles missing size', () => {
    expect(formatFileSize(null)).toBe('-');
  });
});
