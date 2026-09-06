import { describe, expect, it } from 'vitest';
import { isCurrentVersion, nextVersion } from './uploadHistory';
import type { UploadHistoryRow } from '../types/db';

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
