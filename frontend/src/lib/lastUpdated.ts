/** Most recent `updated_at` across a Week's uploaded files (single-file `uploads` and multi-file `upload_files` rows alike) — "how fresh is this Week's data", used wherever a page shows a Week's data. */
export function lastUpdatedAt(uploads: { updated_at: string }[] | undefined): string | undefined {
  return (uploads ?? []).map((u) => u.updated_at).sort().at(-1);
}
