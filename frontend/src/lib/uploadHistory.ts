import type { UploadHistoryRow } from '../types/db';

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

