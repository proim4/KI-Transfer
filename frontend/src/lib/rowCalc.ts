import type { TrackingResultRow } from '../types/db';

const TOLERANCE = 0.1;

/**
 * Mirrors supabase/functions/_shared/calcEngine.ts's computeChannel exactly
 * (duplicated, not imported — same cross-project-boundary reason as
 * aggregate.ts's own copy). Any change here must be mirrored there too.
 */
function computeChannel(actualTotal: number, plan: number): { capped: number; toleranceAdj: number; diff: number; pct: number | null } {
  if (plan <= 0) return { capped: 0, toleranceAdj: 0, diff: 0, pct: null };
  const capped = Math.min(actualTotal, plan);
  const toleranceAdj = capped === 0 ? 0 : plan - capped < TOLERANCE * plan ? plan : capped;
  return { capped, toleranceAdj, diff: toleranceAdj - plan, pct: toleranceAdj / plan };
}

export interface RecomputedRow {
  actual_total: number;
  weekly_capped: number;
  weekly_tolerance_adj: number;
  weekly_diff: number;
  weekly_pct: number | null;
  daily_capped: number;
  daily_tolerance_adj: number;
  daily_diff: number;
  daily_pct: number | null;
  total_capped: number;
  total_tolerance_adj: number;
  total_diff: number;
  total_pct: number | null;
  overage: number;
  profit_realized: number;
  profit_lost: number;
}

/**
 * Recomputes every field derived from actual_total for one tracking_results
 * row given a new actual value — mirrors calcEngine.ts's per-row math
 * exactly (weekly/daily/total capped/toleranceAdj/diff/pct + overage/profit),
 * since plan and price stay row-owned and unaffected by the adjustment.
 * Used both for the live edit-preview and to build the row patch actually
 * persisted, so the two can never disagree.
 */
export function recomputeTrackingRow(row: TrackingResultRow, newActualTotal: number): RecomputedRow {
  const weekly = computeChannel(newActualTotal, Number(row.plan_weekly));
  const daily = computeChannel(newActualTotal, Number(row.plan_daily));
  const total = computeChannel(newActualTotal, Number(row.plan_total));
  const planTotal = Number(row.plan_total);
  const originPrice = Number(row.origin_price);
  const destPrice = Number(row.dest_price);
  return {
    actual_total: newActualTotal,
    weekly_capped: weekly.capped,
    weekly_tolerance_adj: weekly.toleranceAdj,
    weekly_diff: weekly.diff,
    weekly_pct: weekly.pct,
    daily_capped: daily.capped,
    daily_tolerance_adj: daily.toleranceAdj,
    daily_diff: daily.diff,
    daily_pct: daily.pct,
    total_capped: total.capped,
    total_tolerance_adj: total.toleranceAdj,
    total_diff: total.diff,
    total_pct: total.pct,
    overage: Math.max(newActualTotal - planTotal, 0),
    // `=== 0 ? 0 : x` normalizes -0 (e.g. -1 * 0) to plain 0 so formatBaht never prints "-0 บาท".
    profit_realized: normalizeZero((destPrice - originPrice) * newActualTotal),
    profit_lost: normalizeZero(-Math.max(0, planTotal - newActualTotal) * Math.max(0, destPrice - originPrice)),
  };
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Route key rows share the same actual_total under (production_date, origin_code, dest_code, product_group) — matches calcEngine.ts's matchKey. */
export function routeKeyOf(r: Pick<TrackingResultRow, 'production_date' | 'origin_code' | 'dest_code' | 'product_group'>): string {
  return `${r.production_date}|${r.origin_code}|${r.dest_code}|${r.product_group}`;
}
