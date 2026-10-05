/**
 * ABS0000 exports are capped at 5,000 rows, so a full week arrives as several
 * disjoint files — and since they now all combine, re-uploading the same
 * export under a different name (e.g. a browser's "(1)" re-download) would
 * double-count โอนจริง. These helpers detect that by row overlap.
 */
export const SUSPECTED_EXPORT_ROW_LIMIT = 5000;

/** At or above this share of a new file's rows already present in one existing file, the upload is treated as a duplicate of it. */
export const DUPLICATE_OVERLAP_THRESHOLD = 0.9;

export interface ActualFingerprintFields {
  transfer_date: string;
  origin_code: string;
  dest_code: string;
  sku_code: string;
  weight_kg: number | string;
}

export function actualRowFingerprint(r: ActualFingerprintFields): string {
  return `${r.transfer_date}|${r.origin_code}|${r.dest_code}|${r.sku_code}|${Number(r.weight_kg)}`;
}

/**
 * Share of `incoming` that is also in `existing`, compared as multisets —
 * identical rows legitimately repeat within one real file (e.g. two 15kg
 * cartons of the same SKU on the same day), so a plain Set would undercount
 * a genuine duplicate's overlap.
 */
export function overlapRatio(incoming: string[], existing: string[]): number {
  if (incoming.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const k of existing) remaining.set(k, (remaining.get(k) ?? 0) + 1);
  let shared = 0;
  for (const k of incoming) {
    const n = remaining.get(k) ?? 0;
    if (n > 0) {
      shared += 1;
      remaining.set(k, n - 1);
    }
  }
  return shared / incoming.length;
}

/** The existing file (by id) whose rows most overlap `incoming`, if that overlap reaches DUPLICATE_OVERLAP_THRESHOLD. */
export function findDuplicateFile(
  incoming: string[],
  existingByFile: Map<string, string[]>,
): { fileId: string; ratio: number } | null {
  let best: { fileId: string; ratio: number } | null = null;
  for (const [fileId, keys] of existingByFile) {
    const ratio = overlapRatio(incoming, keys);
    if (!best || ratio > best.ratio) best = { fileId, ratio };
  }
  return best && best.ratio >= DUPLICATE_OVERLAP_THRESHOLD ? best : null;
}

/** A file whose row count lands exactly on the source system's export cap was very likely cut off there. */
export function looksTruncated(totalRowCount: number): boolean {
  return totalRowCount === SUSPECTED_EXPORT_ROW_LIMIT;
}
