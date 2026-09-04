import type { WeekRow } from '../types/db';

export interface ActivityStamp {
  week_id: string;
  timestamp: string;
}

/**
 * The week to show by default when a page opens: the week with the most
 * recent upload activity. Takes stamps from *both* upload_history.created_at
 * (new uploads) and uploads.updated_at (uploads made before upload_history
 * existed) — a week can have real, fully-processed data with zero
 * upload_history rows, so history alone isn't a reliable signal. Falls back
 * to the newest week by (year_no, week_no) — weeks[0] from useWeeks, already
 * sorted that way — only when the week has never had anything uploaded to it
 * (e.g. a freshly created week with no files yet).
 *
 * activityStamps is fetched globally (across every product line), so it must
 * be filtered down to the ids present in `weeks` (already scoped to one
 * product line) before picking the max — otherwise a chicken week's upload
 * could be picked as "latest" while viewing the pork tab, or vice versa.
 */
export function pickLatestWeekId(weeks: WeekRow[], activityStamps: ActivityStamp[]): string | null {
  const weekIds = new Set(weeks.map((w) => w.id));
  const relevantStamps = activityStamps.filter((s) => weekIds.has(s.week_id));
  if (relevantStamps.length > 0) {
    const latest = relevantStamps.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    return latest.week_id;
  }
  return weeks[0]?.id ?? null;
}
