import { allocatedChannelActual, computeChannel } from '../../../supabase/functions/_shared/calcEngine.ts';
import { routeKeyOf } from './rowCalc';
import type { TrackingResultRow } from '../types/db';

export type Channel = 'weekly' | 'daily' | 'total';

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface ChannelAggregate {
  planSum: number;
  cappedSum: number;
  toleranceAdjSum: number;
  diff: number;
  pct: number | null;
}

const PLAN_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'plan_weekly',
  daily: 'plan_daily',
  total: 'plan_total',
};

/**
 * Groups rows by (production_date, origin_code, dest_code, product_group) —
 * collapsing the price-variant split (a route can carry more than one price
 * in the same week — real WK36 data has ~46 such routes) back down to one
 * entry per physical route. actual_total is identical across every
 * price-variant row sharing a route (see the calc engine's matchKey), so it
 * must be counted once per group, never once per row.
 */
function groupByRoute(rows: TrackingResultRow[]): Map<string, TrackingResultRow[]> {
  const groups = new Map<string, TrackingResultRow[]>();
  for (const r of rows) {
    const key = routeKeyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/**
 * Ratio-of-sums aggregation — matches Excel's SUBTOTAL(9,...) grand totals
 * and the Summary sheet's pivot calculated field. Never average the per-row
 * `pct` values: that weights every route equally regardless of volume.
 *
 * Recomputes capped/toleranceAdj per physical route from the passed-in rows'
 * plan and their proportional share of the route's actual — never the full
 * shared actual for a partial set of variants, and never once per variant.
 */
export function aggregateChannel(rows: TrackingResultRow[], channel: Channel): ChannelAggregate {
  const planField = PLAN_FIELD[channel];
  let planSum = 0;
  let cappedSum = 0;
  let toleranceAdjSum = 0;
  for (const routeRows of groupByRoute(rows).values()) {
    const plan = sum(routeRows.map((r) => Number(r[planField])));
    // actual_total / route_plan_* are identical across every price variant of this route; only the
    // passed-in rows' share of it counts (a filter may have kept just some of the variants)
    const [first] = routeRows;
    const actual = allocatedChannelActual(
      Number(first.actual_total),
      Number(first.route_plan_weekly),
      Number(first.route_plan_daily),
      channel,
      plan,
    );
    const { capped, toleranceAdj } = computeChannel(actual, plan);
    planSum += plan;
    cappedSum += capped;
    toleranceAdjSum += toleranceAdj;
  }
  return {
    planSum,
    cappedSum,
    toleranceAdjSum,
    diff: toleranceAdjSum - planSum,
    pct: planSum > 0 ? toleranceAdjSum / planSum : null,
  };
}

/**
 * Total actual-transfer weight across the given rows — the sum of each row's
 * own share of its route's actual (actual_alloc), so a route counts exactly
 * once when all its price variants are present and only proportionally when
 * a filter left some out.
 */
export function dedupedActualTotal(rows: TrackingResultRow[]): number {
  return sum(rows.map((r) => Number(r.actual_alloc)));
}

const SUGGEST_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'suggest_weekly',
  daily: 'suggest_daily',
  total: 'suggest_total',
};
const REJECT_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'reject_weekly',
  daily: 'reject_daily',
  total: 'reject_total',
};

export interface RejectAggregate {
  suggestSum: number;
  rejectSum: number;
  pct: number | null;
}

/**
 * Reject (suggest vs. finalized plan) is plan-side only — no actual
 * involved — so unlike aggregateChannel/dedupedActualTotal, summing it
 * straight across price-variant rows is already correct: each variant
 * legitimately owns its own slice of the suggestion and the finalized plan.
 */
export function aggregateReject(rows: TrackingResultRow[], channel: Channel): RejectAggregate {
  const suggestSum = sum(rows.map((r) => Number(r[SUGGEST_FIELD[channel]])));
  const rejectSum = sum(rows.map((r) => Number(r[REJECT_FIELD[channel]])));
  return { suggestSum, rejectSum, pct: suggestSum > 0 ? rejectSum / suggestSum : null };
}

export interface DailyTrendPoint {
  date: string;
  weeklyPct: number | null;
  dailyPct: number | null;
  totalPct: number | null;
  planTotal: number;
  actualTotal: number;
}

export function buildDailyTrend(rows: TrackingResultRow[]): DailyTrendPoint[] {
  const byDate = new Map<string, TrackingResultRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.production_date);
    if (list) list.push(row);
    else byDate.set(row.production_date, [row]);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateRows]) => ({
      date,
      weeklyPct: aggregateChannel(dateRows, 'weekly').pct,
      dailyPct: aggregateChannel(dateRows, 'daily').pct,
      totalPct: aggregateChannel(dateRows, 'total').pct,
      planTotal: sum(dateRows.map((r) => Number(r.plan_total))),
      actualTotal: dedupedActualTotal(dateRows),
    }));
}
