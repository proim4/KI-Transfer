import { allocatedChannelActual, computeChannel, matchKey } from '../../../supabase/functions/_shared/calcEngine.ts';
import type { TrackingResultRow } from '../types/db';

export interface RecomputedRow {
  actual_total: number;
  actual_alloc: number;
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
 * row given a new actual value for its route — mirrors calcEngine.ts's
 * computeTracking row formulas exactly (reusing its computeChannel /
 * allocatedChannelActual), so this row is credited only its proportional
 * share of the route's actual (by its share of the route plan, stored on the
 * row as route_plan_weekly/daily). Used both for the live edit-preview and to
 * build the row patch actually persisted, so the two can never disagree.
 *
 * `routeVariantCount` is how many price-variant rows the route has — only
 * used to split evenly when the route has no plan at all.
 */
export function recomputeTrackingRow(row: TrackingResultRow, newActualTotal: number, routeVariantCount: number): RecomputedRow {
  const routePlanWeekly = Number(row.route_plan_weekly);
  const routePlanDaily = Number(row.route_plan_daily);
  const planWeekly = Number(row.plan_weekly);
  const planDaily = Number(row.plan_daily);
  const planTotal = Number(row.plan_total);
  const actualAlloc =
    routePlanWeekly + routePlanDaily > 0
      ? allocatedChannelActual(newActualTotal, routePlanWeekly, routePlanDaily, 'total', planTotal)
      : newActualTotal / Math.max(routeVariantCount, 1);
  const weekly = computeChannel(allocatedChannelActual(newActualTotal, routePlanWeekly, routePlanDaily, 'weekly', planWeekly), planWeekly);
  const daily = computeChannel(allocatedChannelActual(newActualTotal, routePlanWeekly, routePlanDaily, 'daily', planDaily), planDaily);
  const total = computeChannel(actualAlloc, planTotal);
  const originPrice = Number(row.origin_price);
  const destPrice = Number(row.dest_price);
  return {
    actual_total: newActualTotal,
    actual_alloc: actualAlloc,
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
    overage: Math.max(actualAlloc - planTotal, 0),
    // `=== 0 ? 0 : x` normalizes -0 (e.g. -1 * 0) to plain 0 so formatBaht never prints "-0 บาท".
    profit_realized: normalizeZero((destPrice - originPrice) * actualAlloc),
    profit_lost: normalizeZero(-Math.max(0, planTotal - actualAlloc) * Math.max(0, destPrice - originPrice)),
  };
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Route key rows share the same actual_total under (production_date, origin_code, dest_code, product_group) — delegates to calcEngine.ts's own matchKey so the two can't drift apart. */
export function routeKeyOf(r: Pick<TrackingResultRow, 'production_date' | 'origin_code' | 'dest_code' | 'product_group'>): string {
  return matchKey(r.production_date, r.origin_code, r.dest_code, r.product_group);
}

