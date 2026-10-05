/**
 * Upload-time sanity checks that keep a file from silently landing in the
 * wrong Week or double-counting plan data. Pure functions — the upload hooks
 * fetch what's needed and turn a failed check into an upload error.
 */

/** Monday..Sunday ('YYYY-MM-DD') of ISO week `weekNo` of `yearNo` — the same numbering WeekSelector creates weeks with. */
export function isoWeekRange(yearNo: number, weekNo: number): { start: string; end: string } {
  // ISO week 1 is the week containing January 4th.
  const jan4 = new Date(Date.UTC(yearNo, 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(jan4);
  start.setUTCDate(jan4.getUTCDate() - jan4Weekday + (weekNo - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** One day either side is still "this week" — a transfer can legitimately fall a day off its plan (see the ±1-day rule). */
export const WEEK_EDGE_TOLERANCE_DAYS = 1;

export interface WeekDateCheck {
  /** Dates (deduplicated, sorted) of rows outside the week ± tolerance. */
  outsideDates: string[];
  outsideRowCount: number;
  /** True when most rows fall outside — the file almost certainly belongs to a different Week. */
  looksLikeOtherWeek: boolean;
}

export function checkDatesInWeek(dates: string[], range: { start: string; end: string }): WeekDateCheck {
  const from = shiftDays(range.start, -WEEK_EDGE_TOLERANCE_DAYS);
  const to = shiftDays(range.end, WEEK_EDGE_TOLERANCE_DAYS);
  const outside = dates.filter((d) => d < from || d > to);
  return {
    outsideDates: Array.from(new Set(outside)).sort(),
    outsideRowCount: outside.length,
    looksLikeOtherWeek: dates.length > 0 && outside.length > dates.length / 2,
  };
}

export function describeWeekMismatch(check: WeekDateCheck, weekLabel: string, range: { start: string; end: string }): string {
  const shown = check.outsideDates.slice(0, 5).map(formatDayMonth).join(', ');
  const more = check.outsideDates.length > 5 ? ` และอีก ${check.outsideDates.length - 5} วัน` : '';
  return `ไฟล์นี้มีวันที่ ${shown}${more} (${check.outsideRowCount} แถว) ซึ่งอยู่นอก ${weekLabel} (${formatDayMonth(range.start)}–${formatDayMonth(range.end)}) — ตรวจสอบว่าเลือก Week ถูกต้อง`;
}

/**
 * Plan dates the new file shares with plan files already uploaded to this
 * Week, by file id. Two BDR130 files covering the same date are two versions
 * of that day's plan (real WK36 data had both a 49-row and a 113-row export
 * for 31/08) — combining them would double the plan.
 */
export function findOverlappingDates(newDates: string[], existingDatesByFile: Map<string, Set<string>>): Map<string, string[]> {
  const unique = Array.from(new Set(newDates)).sort();
  const overlaps = new Map<string, string[]>();
  for (const [fileId, dates] of existingDatesByFile) {
    const shared = unique.filter((d) => dates.has(d));
    if (shared.length > 0) overlaps.set(fileId, shared);
  }
  return overlaps;
}
