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

  totalSupplyQty: number;
  biddingRecordCount: number;
  pricedDownRecordCount: number;
  planRecordCount: number;
  actualRecordCount: number;

  offPlanCount: number;
  offPlanOffZoneCount: number;
  pricedDownOffPlanCount: number;
  lowBidOffPlanCount: number;
  supplyNoPlanCount: number;
  actualNoPlanCount: number;
  planNoActualCount: number;
  unresolvedCount: number;

  /** % of active rows (plan_out>0 or actual_out>0) that are NOT off-plan. */
  onPlanPct: number | null;
  offPlanPct: number | null;
  /** % of rows with a Bidding record (is_low_bid) that did NOT end up off-plan — i.e. the demand was still captured by the transfer plan. */
  biddingEnteredSystemPct: number | null;
  biddingNotEnteredSystemPct: number | null;
}

/**
 * All counts are row-level (one supply_daily_results row = one
 * (production_date, origin_code, product_group) key), not raw upload rows —
 * see supplyDailyCalcEngine.ts for how each flag is computed.
 */
export function computeSupplyDailyKpis(rows: SupplyDailyResultRow[], totalFactories: number): SupplyDailyKpis {
  const filedRows = rows.filter((r) => r.filed);
  const filedOrigins = new Set(filedRows.map((r) => r.origin_code));
  const activeRows = rows.filter((r) => r.plan_out > 0 || r.actual_out > 0);
  const biddingRows = rows.filter((r) => r.is_low_bid);
  const lowBidOffPlanCount = rows.filter((r) => r.is_low_bid_off_plan).length;

  return {
    totalFactories,
    filedFactories: filedOrigins.size,
    filedPct: pct(filedOrigins.size, totalFactories),

    filedRowCount: filedRows.length,

    totalSupplyQty: sum(filedRows.map((r) => r.remaining_qty)),
    biddingRecordCount: biddingRows.length,
    pricedDownRecordCount: rows.filter((r) => r.is_priced_down).length,
    planRecordCount: rows.filter((r) => r.plan_out > 0).length,
    actualRecordCount: rows.filter((r) => r.actual_out > 0).length,

    offPlanCount: rows.filter((r) => r.is_off_plan).length,
    offPlanOffZoneCount: sum(rows.map((r) => r.is_off_plan_off_zone)),
    pricedDownOffPlanCount: rows.filter((r) => r.is_priced_down_off_plan).length,
    lowBidOffPlanCount,
    supplyNoPlanCount: rows.filter((r) => r.filed && r.plan_out === 0).length,
    actualNoPlanCount: rows.filter((r) => r.actual_out > 0 && r.plan_out === 0).length,
    planNoActualCount: rows.filter((r) => r.plan_out > 0 && r.actual_out === 0).length,
    unresolvedCount: rows.filter((r) => r.origin_zone_unresolved || r.vendor_group_unresolved).length,

    onPlanPct: pct(activeRows.filter((r) => !r.is_off_plan).length, activeRows.length),
    offPlanPct: pct(activeRows.filter((r) => r.is_off_plan).length, activeRows.length),
    biddingEnteredSystemPct: pct(biddingRows.length - lowBidOffPlanCount, biddingRows.length),
    biddingNotEnteredSystemPct: pct(lowBidOffPlanCount, biddingRows.length),
  };
}

export type ExceptionKey =
  | 'low_bid_off_plan'
  | 'priced_down_off_plan'
  | 'actual_no_plan'
  | 'supply_no_plan'
  | 'plan_no_actual'
  | 'off_plan'
  | 'unresolved';

export const EXCEPTION_LABELS: Record<ExceptionKey, string> = {
  low_bid_off_plan: 'Bidding แต่ไม่เข้าระบบโอน',
  priced_down_off_plan: 'ลงราคาแล้วเกิดโอนนอกแผน',
  actual_no_plan: 'โอนจริงแต่ไม่มีแผน',
  supply_no_plan: 'Supply แต่ไม่มีแผนโอน',
  plan_no_actual: 'แผนโอนแต่ไม่มีโอนจริง',
  off_plan: 'โอนนอกแผน',
  unresolved: 'ไม่สามารถ Match ข้อมูลได้ (Master Data ไม่ครบ)',
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
    case 'unresolved':
      return row.origin_zone_unresolved || row.vendor_group_unresolved;
  }
}
