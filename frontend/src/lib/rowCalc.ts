import { channelActual, computeChannel, matchKey } from '../../../supabase/functions/_shared/calcEngine.ts';
import type { TrackingResultRow } from '../types/db';

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
 * row given a new actual value — reuses calcEngine.ts's own computeChannel
 * for weekly/daily/total capped/toleranceAdj/diff/pct (only overage/profit,
 * which need row-owned plan/price rather than a single (actual, plan) pair,
 * are reimplemented here). Used both for the live edit-preview and to build
 * the row patch actually persisted, so the two can never disagree.
 *
 * `routePlanWeekly` is the Weekly plan summed across every price-variant
 * sibling of the route (see routePlanWeeklyOf) — Daily is scored only on the
 * actual left over after Weekly (calcEngine's channelActual).
 */
export function recomputeTrackingRow(row: TrackingResultRow, newActualTotal: number, routePlanWeekly: number): RecomputedRow {
  const weekly = computeChannel(channelActual(newActualTotal, routePlanWeekly, 'weekly'), Number(row.plan_weekly));
  const daily = computeChannel(channelActual(newActualTotal, routePlanWeekly, 'daily'), Number(row.plan_daily));
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

/** Route key rows share the same actual_total under (production_date, origin_code, dest_code, product_group) — delegates to calcEngine.ts's own matchKey so the two can't drift apart. */
export function routeKeyOf(r: Pick<TrackingResultRow, 'production_date' | 'origin_code' | 'dest_code' | 'product_group'>): string {
  return matchKey(r.production_date, r.origin_code, r.dest_code, r.product_group);
}

/** Weekly plan summed across a route's price-variant sibling rows — the amount of actual Weekly consumes before Daily sees any. */
export function routePlanWeeklyOf(siblings: Pick<TrackingResultRow, 'plan_weekly'>[]): number {
  return siblings.reduce((a, r) => a + Number(r.plan_weekly), 0);
}
