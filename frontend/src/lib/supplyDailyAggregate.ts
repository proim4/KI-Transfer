import type { SupplyDailyResultRow } from '../types/db';

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface SupplyDailyKpis {
  totalFactories: number;
  filedFactories: number;
  filedPct: number | null;

  filedRowCount: number;
  onTimeRowCount: number;
  onTimePct: number | null;

  offPlanCount: number;
  offPlanOffZoneCount: number;
  pricedDownOffPlanCount: number;
  lowBidOffPlanCount: number;
  supplyNoPlanCount: number;
  actualNoPlanCount: number;
  planNoActualCount: number;
}

/**
 * All counts are row-level (one supply_daily_results row = one
 * (production_date, origin_code, product_group) key), not raw upload rows —
 * see supplyDailyCalcEngine.ts for how each flag is computed.
 */
export function computeSupplyDailyKpis(rows: SupplyDailyResultRow[], totalFactories: number): SupplyDailyKpis {
  const filedRows = rows.filter((r) => r.filed);
  const filedOrigins = new Set(filedRows.map((r) => r.origin_code));

  return {
    totalFactories,
    filedFactories: filedOrigins.size,
    filedPct: pct(filedOrigins.size, totalFactories),

    filedRowCount: filedRows.length,
    onTimeRowCount: filedRows.filter((r) => r.filed_on_time).length,
    onTimePct: pct(filedRows.filter((r) => r.filed_on_time).length, filedRows.length),

    offPlanCount: rows.filter((r) => r.is_off_plan).length,
    offPlanOffZoneCount: sum(rows.map((r) => r.is_off_plan_off_zone)),
    pricedDownOffPlanCount: rows.filter((r) => r.is_priced_down_off_plan).length,
    lowBidOffPlanCount: rows.filter((r) => r.is_low_bid_off_plan).length,
    supplyNoPlanCount: rows.filter((r) => r.filed && r.plan_out === 0).length,
    actualNoPlanCount: rows.filter((r) => r.actual_out > 0 && r.plan_out === 0).length,
    planNoActualCount: rows.filter((r) => r.plan_out > 0 && r.actual_out === 0).length,
  };
}

export type ExceptionKey =
  | 'low_bid_off_plan'
  | 'priced_down_off_plan'
  | 'actual_no_plan'
  | 'supply_no_plan'
  | 'plan_no_actual'
  | 'off_plan'
  | 'late_filing';

export const EXCEPTION_LABELS: Record<ExceptionKey, string> = {
  low_bid_off_plan: 'Bidding แต่ไม่เข้าระบบโอน',
  priced_down_off_plan: 'ลงราคาแล้วเกิดโอนนอกแผน',
  actual_no_plan: 'โอนจริงแต่ไม่มีแผน',
  supply_no_plan: 'Supply แต่ไม่มีแผนโอน',
  plan_no_actual: 'แผนโอนแต่ไม่มีโอนจริง',
  off_plan: 'โอนนอกแผน',
  late_filing: 'กรอก Supply ไม่ทันเวลา',
};

export function matchesException(row: SupplyDailyResultRow, key: ExceptionKey): boolean {
  switch (key) {
    case 'low_bid_off_plan':
      return row.is_low_bid_off_plan;
    case 'priced_down_off_plan':
      return row.is_priced_down_off_plan;
    case 'actual_no_plan':
      return row.actual_out > 0 && row.plan_out === 0;
    case 'supply_no_plan':
      return row.filed && row.plan_out === 0;
    case 'plan_no_actual':
      return row.plan_out > 0 && row.actual_out === 0;
    case 'off_plan':
      return row.is_off_plan;
    case 'late_filing':
      return row.filed && !row.filed_on_time;
  }
}
