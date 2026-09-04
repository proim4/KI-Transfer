import type { UploadHistoryRow, WeekRow } from '../types/db';

/** Next version number for a (week, file_type) slot given the versions already logged for it. */
export function nextVersion(existingVersions: number[]): number {
  return existingVersions.length === 0 ? 1 : Math.max(...existingVersions) + 1;
}

/**
 * A history row is "current" for its slot if it's the highest-version row
 * among the ones passed in for that same (week_id, file_type) — i.e. nothing
 * has replaced it since. `rowsForSameSlot` should already be scoped to one
 * slot (callers pass the full history list filtered by file_type).
 */
export function isCurrentVersion(row: UploadHistoryRow, rowsForSameSlot: UploadHistoryRow[]): boolean {
  const maxVersion = Math.max(...rowsForSameSlot.map((r) => r.version));
  return row.version === maxVersion;
}

export interface WeekHistorySummary {
  weekId: string;
  weekLabel: string;
  fileCount: number;
  lastUpdated: string;
}

/**
 * Groups upload_history rows by week for the collapsed "ประวัติการอัปโหลด"
 * summary list — one line per week ("WK36 — 3 Files • Updated 13:25") instead
 * of a big always-open table. fileCount counts each slot's *current* file
 * only (not every historical attempt); lastUpdated is the most recent attempt
 * of any kind for that week. Sorted most-recently-updated first.
 */
export function groupHistoryByWeek(rows: UploadHistoryRow[], weeks: WeekRow[]): WeekHistorySummary[] {
  const weekLabelById = new Map(weeks.map((w) => [w.id, w.label]));
  const byWeek = new Map<string, UploadHistoryRow[]>();
  for (const row of rows) {
    const bucket = byWeek.get(row.week_id) ?? [];
    bucket.push(row);
    byWeek.set(row.week_id, bucket);
  }

  const summaries: WeekHistorySummary[] = [];
  for (const [weekId, weekRows] of byWeek) {
    const fileTypes = [...new Set(weekRows.map((r) => r.file_type))];
    const fileCount = fileTypes.filter((fileType) => {
      const slotRows = weekRows.filter((r) => r.file_type === fileType);
      const current = slotRows.find((r) => isCurrentVersion(r, slotRows));
      return current?.status === 'validated';
    }).length;
    const lastUpdated = weekRows.map((r) => r.created_at).reduce((a, b) => (a > b ? a : b));
    summaries.push({ weekId, weekLabel: weekLabelById.get(weekId) ?? weekId, fileCount, lastUpdated });
  }

  return summaries.sort((a, b) => (a.lastUpdated > b.lastUpdated ? -1 : 1));
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
