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
const CAPPED_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'weekly_capped',
  daily: 'daily_capped',
  total: 'total_capped',
};
const TOLERANCE_ADJ_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'weekly_tolerance_adj',
  daily: 'daily_tolerance_adj',
  total: 'total_tolerance_adj',
};

/**
 * Ratio-of-sums aggregation — matches Excel's SUBTOTAL(9,...) grand totals and
 * the Summary sheet's pivot calculated field. Never average the per-row `pct`
 * values: that weights every route equally regardless of volume.
 */
export function aggregateChannel(rows: TrackingResultRow[], channel: Channel): ChannelAggregate {
  const planSum = sum(rows.map((r) => Number(r[PLAN_FIELD[channel]])));
  const cappedSum = sum(rows.map((r) => Number(r[CAPPED_FIELD[channel]])));
  const toleranceAdjSum = sum(rows.map((r) => Number(r[TOLERANCE_ADJ_FIELD[channel]])));
  return {
    planSum,
    cappedSum,
    toleranceAdjSum,
    diff: toleranceAdjSum - planSum,
    pct: planSum > 0 ? toleranceAdjSum / planSum : null,
  };
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
      actualTotal: sum(dateRows.map((r) => Number(r.actual_total))),
    }));
}
