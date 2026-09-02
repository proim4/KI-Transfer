import type { TrackingResultRow } from '../types/db';

export type Channel = 'weekly' | 'daily' | 'total';

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

const TOLERANCE = 0.1;

/**
 * Mirrors supabase/functions/_shared/calcEngine.ts's computeChannel exactly
 * (duplicated, not imported, since the frontend can't cross the Edge
 * Function's own TS project boundary — see types/tracking.ts for the same
 * rationale). Any change here must be mirrored there too.
 */
function computeChannel(actualTotal: number, plan: number): { capped: number; toleranceAdj: number } {
  if (plan <= 0) return { capped: 0, toleranceAdj: 0 };
  const capped = Math.min(actualTotal, plan);
  const toleranceAdj = capped === 0 ? 0 : plan - capped < TOLERANCE * plan ? plan : capped;
  return { capped, toleranceAdj };
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

function routeKeyOf(r: TrackingResultRow): string {
  return `${r.production_date}|${r.origin_code}|${r.dest_code}|${r.product_group}`;
}

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
 * Recomputes capped/toleranceAdj per physical route (summing plan across its
 * price variants, but taking actual once) rather than summing the stored
 * per-row values — otherwise a route with N price points would have its
 * actual credited N times, inflating the aggregate %.
 */
export function aggregateChannel(rows: TrackingResultRow[], channel: Channel): ChannelAggregate {
  const planField = PLAN_FIELD[channel];
  let planSum = 0;
  let cappedSum = 0;
  let toleranceAdjSum = 0;
  for (const routeRows of groupByRoute(rows).values()) {
    const plan = sum(routeRows.map((r) => Number(r[planField])));
    const actual = Number(routeRows[0].actual_total); // identical across every price variant of this route
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
 * Total actual-transfer weight across the given rows, counted once per
 * physical route (date/origin/dest/product group) — never once per
 * price-variant row, since those rows deliberately share the same actual
 * pool.
 */
export function dedupedActualTotal(rows: TrackingResultRow[]): number {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = routeKeyOf(r);
    if (!seen.has(key)) seen.set(key, Number(r.actual_total));
  }
  return sum(Array.from(seen.values()));
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
