import type { UploadRow } from '../types/db';

/** Most recent `updated_at` across a Week's uploaded files — "how fresh is this Week's data", used wherever a page shows a Week's data. */
export function lastUpdatedAt(uploads: UploadRow[] | undefined): string | undefined {
  return (uploads ?? []).map((u) => u.updated_at).sort().at(-1);
}
