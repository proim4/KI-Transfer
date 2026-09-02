import type {
  ActualRow,
  Channel,
  ChannelResult,
  PlanRow,
  TrackingResult,
  UnmatchedActual,
} from './types.ts';

const TOLERANCE = 0.1;

/**
 * The key actual-transfer weight is matched on: SUMIFS in the tracking sheet
 * matches origin, dest, transfer date and product group only — price is
 * never one of its criteria.
 */
function matchKey(date: string, origin: string, dest: string, productGroup: string): string {
  return `${date}|${origin}|${dest}|${productGroup}`;
}

/**
 * The key a plan *row* (tracking-sheet output row) is identified by. The
 * embedded pivot's row fields include origin/dest price alongside date,
 * origin, dest and product group — real WK36 data has ~46 routes with more
 * than one price on the same date/origin/dest/group (e.g. a mid-week price
 * change), and Excel keeps those as separate pivot rows rather than merging
 * them. Two price-variant rows for the same route independently look up the
 * SAME actual total via matchKey (matching Excel's SUMIFS, which also never
 * references price) — this is intentional, not a shared/depleting pool.
 */
function fullGroupKey(date: string, origin: string, dest: string, productGroup: string, originPrice: number, destPrice: number): string {
  return `${matchKey(date, origin, dest, productGroup)}|${originPrice}|${destPrice}`;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Reproduces the tracking sheet's O/P/Q/R (and S/T/U/V, W/X/Y/Z) formula group:
 *   capped        = MIN(actual, plan)                       (0 if plan <= 0)
 *   toleranceAdj  = capped == 0 ? 0
 *                 : (plan - capped) < 10% * plan ? plan      ("ปัดหน่วยหยิบ" rounding)
 *                 : capped
 *   diff          = toleranceAdj - plan
 *   pct           = toleranceAdj / plan                      (null, i.e. "-", if plan <= 0)
 */
export function computeChannel(actualTotal: number, plan: number): ChannelResult {
  if (plan <= 0) {
    return { capped: 0, toleranceAdj: 0, diff: 0, pct: null };
  }
  const capped = Math.min(actualTotal, plan);
  const toleranceAdj = capped === 0 ? 0 : plan - capped < TOLERANCE * plan ? plan : capped;
  return {
    capped,
    toleranceAdj,
    diff: toleranceAdj - plan,
    pct: toleranceAdj / plan,
  };
}

export interface ComputeTrackingResult {
  results: TrackingResult[];
  unmatchedActual: UnmatchedActual[];
}

/**
 * Groups plan rows into tracking-sheet output rows keyed by
 * (productionDate, originCode, destCode, productGroup, originPrice,
 * destPrice) — matching the embedded pivot's row grain, including price
 * (real WK36 data has ~46 routes with more than one price on the same
 * date/origin/dest/group, e.g. a mid-week price change; Excel keeps those as
 * separate rows). Each row's actual-transfer weight is matched on the
 * price-independent (date, origin, dest, productGroup) key, reproducing the
 * SUMIFS formula exactly — so two price-variant rows for the same route
 * both read the same, undepleted actual total.
 *
 * Matching is at the product-*group* grain (productForPlan19 / P19), never
 * exact SKU — the plan input itself carries no finer granularity, so this
 * mirrors the original workbook exactly.
 */
export function computeTracking(planRows: PlanRow[], actualRows: ActualRow[]): ComputeTrackingResult {
  interface PlanGroup {
    productionDate: string;
    originCode: string;
    originName: string;
    destCode: string;
    destName: string;
    productGroup: string;
    originPrice: number;
    destPrice: number;
    matchKey: string;
    planWeekly: number;
    planDaily: number;
    suggestWeekly: number;
    suggestDaily: number;
  }

  const planGroups = new Map<string, PlanGroup>();
  const matchedKeys = new Set<string>();
  for (const row of planRows) {
    const mKey = matchKey(row.productionDate, row.originCode, row.destCode, row.productGroup);
    const key = fullGroupKey(row.productionDate, row.originCode, row.destCode, row.productGroup, row.originPrice, row.destPrice);
    matchedKeys.add(mKey);
    let group = planGroups.get(key);
    if (!group) {
      group = {
        productionDate: row.productionDate,
        originCode: row.originCode,
        originName: row.originName,
        destCode: row.destCode,
        destName: row.destName,
        productGroup: row.productGroup,
        originPrice: row.originPrice,
        destPrice: row.destPrice,
        matchKey: mKey,
        planWeekly: 0,
        planDaily: 0,
        suggestWeekly: 0,
        suggestDaily: 0,
      };
      planGroups.set(key, group);
    }
    if (row.sourceFile === 'weekly') {
      group.planWeekly += row.supplyAfter;
      group.suggestWeekly += row.suggest;
    } else {
      group.planDaily += row.supplyAfter;
      group.suggestDaily += row.suggest;
    }
  }

  const actualByKey = new Map<string, number>();
  const actualRowsByKey = new Map<string, ActualRow[]>();
  for (const row of actualRows) {
    const key = matchKey(row.transferDate, row.originCode, row.destCode, row.productGroup);
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + row.weightKg);
    const list = actualRowsByKey.get(key);
    if (list) list.push(row);
    else actualRowsByKey.set(key, [row]);
  }

  const results: TrackingResult[] = [];
  for (const group of planGroups.values()) {
    // Not deleted after use: two price-variant rows for the same route both
    // look up the same, undepleted actual total (see fullGroupKey above).
    const actualTotal = actualByKey.get(group.matchKey) ?? 0;
    const planTotal = group.planWeekly + group.planDaily;
    const suggestTotal = group.suggestWeekly + group.suggestDaily;
    const rejectWeekly = Math.max(group.suggestWeekly - group.planWeekly, 0);
    const rejectDaily = Math.max(group.suggestDaily - group.planDaily, 0);
    const rejectTotal = Math.max(suggestTotal - planTotal, 0);

    results.push({
      productionDate: group.productionDate,
      originCode: group.originCode,
      originName: group.originName,
      destCode: group.destCode,
      destName: group.destName,
      productGroup: group.productGroup,
      originPrice: group.originPrice,
      destPrice: group.destPrice,
      planWeekly: group.planWeekly,
      planDaily: group.planDaily,
      planTotal,
      actualTotal,
      weekly: computeChannel(actualTotal, group.planWeekly),
      daily: computeChannel(actualTotal, group.planDaily),
      total: computeChannel(actualTotal, planTotal),
      overage: Math.max(actualTotal - planTotal, 0),
      profitRealized: (group.destPrice - group.originPrice) * actualTotal,
      profitLost: -Math.max(0, planTotal - actualTotal) * Math.max(0, group.destPrice - group.originPrice),
      suggestWeekly: group.suggestWeekly,
      suggestDaily: group.suggestDaily,
      suggestTotal,
      rejectWeekly,
      rejectDaily,
      rejectTotal,
      rejectPct: suggestTotal > 0 ? rejectTotal / suggestTotal : null,
    });
  }

  const unmatchedActual: UnmatchedActual[] = [];
  for (const [key, totalWeightKg] of actualByKey) {
    if (matchedKeys.has(key)) continue; // at least one plan group (any price variant) covers this route/date/group
    const rows = actualRowsByKey.get(key) ?? [];
    const first = rows[0];
    unmatchedActual.push({
      key,
      transferDate: first?.transferDate ?? '',
      originCode: first?.originCode ?? '',
      originName: first?.originName ?? '',
      destCode: first?.destCode ?? '',
      destName: first?.destName ?? '',
      productGroup: first?.productGroup ?? '',
      totalWeightKg,
      rows,
    });
  }

  return { results, unmatchedActual };
}

export interface ChannelAggregate extends ChannelResult {
  planSum: number;
}

/**
 * Ratio-of-sums aggregation, matching Excel's SUBTOTAL(9,...) grand totals and
 * the Summary sheet's pivot calculated field IFERROR(SUM(X)/SUM(M),0).
 * Never average the per-row `pct` values directly — that would weight every
 * route equally regardless of volume, which is not what the workbook does.
 */
export function aggregateChannel(results: TrackingResult[], channel: Channel): ChannelAggregate {
  const planKey = channel === 'weekly' ? 'planWeekly' : channel === 'daily' ? 'planDaily' : 'planTotal';
  const planSum = sum(results.map((r) => r[planKey]));
  const cappedSum = sum(results.map((r) => r[channel].capped));
  const toleranceAdjSum = sum(results.map((r) => r[channel].toleranceAdj));
  return {
    planSum,
    capped: cappedSum,
    toleranceAdj: toleranceAdjSum,
    diff: toleranceAdjSum - planSum,
    pct: planSum > 0 ? toleranceAdjSum / planSum : null,
  };
}

export interface RejectAggregate {
  suggestSum: number;
  rejectSum: number;
  pct: number | null;
}

export function aggregateReject(results: TrackingResult[], channel: Channel): RejectAggregate {
  const suggestKey = channel === 'weekly' ? 'suggestWeekly' : channel === 'daily' ? 'suggestDaily' : 'suggestTotal';
  const rejectKey = channel === 'weekly' ? 'rejectWeekly' : channel === 'daily' ? 'rejectDaily' : 'rejectTotal';
  const suggestSum = sum(results.map((r) => r[suggestKey]));
  const rejectSum = sum(results.map((r) => r[rejectKey]));
  return { suggestSum, rejectSum, pct: suggestSum > 0 ? rejectSum / suggestSum : null };
}
