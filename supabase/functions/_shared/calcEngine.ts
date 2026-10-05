import type {
  ActualAdjustment,
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
export function matchKey(date: string, origin: string, dest: string, productGroup: string): string {
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

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
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

/**
 * The actual weight a channel is scored against. A route's actual is spent
 * on its Weekly plan first and only the remainder counts toward Daily (Daily
 * is the top-up on top of the Weekly plan) — previously both channels were
 * scored against the full actual, so W100 + D100 with 100 actual read
 * Weekly 100% AND Daily 100% while Total read 50%. `routePlanWeekly` is the
 * Weekly plan summed across every price variant of the route, so the split
 * is identical no matter which variant row is being scored.
 */
export function channelActual(actualTotal: number, routePlanWeekly: number, channel: Channel): number {
  if (channel !== 'daily') return actualTotal;
  return Math.max(actualTotal - Math.max(routePlanWeekly, 0), 0);
}

/** How far a ±1-day matched transfer is from its plan date: +1 = transferred the day after the plan date, -1 = the day before. */
export type DayOffset = 1 | -1;

export const DATE_SHIFT_OFFSETS: readonly DayOffset[] = [1, -1]; // late transfer is checked first

/** A user's decision on one ±1-day match suggestion, keyed by the *actual* group's matchKey (its own transfer date). */
export interface DateShiftDecision {
  decision: 'confirmed' | 'rejected';
  targetPlanDate: string;
  decidedByName: string | null;
}

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function offsetLabel(offset: DayOffset): string {
  return offset === 1 ? 'โอนช้า 1 วัน' : 'โอนก่อน 1 วัน';
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
/**
 * `adjustments` carries the latest manual override per route (see
 * ActualAdjustment) so a user's correction to "โอนจริง" survives the next
 * time this week is reprocessed (e.g. a re-upload of ABS0000) instead of
 * being silently wiped by the fresh sum from actualRows. Each route's
 * `actualOriginal` still reflects the current raw ABS0000 sum, so "original
 * vs adjusted" always compares against the latest upload, not a stale one.
 *
 * `dateShiftDecisions` (keyed by the actual group's own matchKey) controls
 * the ±1-day rule: an actual group whose exact date has no plan, but whose
 * route + product group is planned (and still short) one day earlier or
 * later, is only *suggested* — it stays in unmatchedActual and adds a
 * "รอยืนยัน" note to the plan row until a user confirms it. Once confirmed,
 * its weight is credited to that plan date's route and noted there.
 */
export function computeTracking(
  planRows: PlanRow[],
  actualRows: ActualRow[],
  adjustments: Map<string, ActualAdjustment> = new Map(),
  dateShiftDecisions: Map<string, DateShiftDecision> = new Map(),
): ComputeTrackingResult {
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

  // Plan per physical route (summed across price variants) — the Weekly
  // total drives the Weekly-first split, the overall total decides whether a
  // ±1-day match target is planned at all.
  const routePlan = new Map<string, { weekly: number; total: number }>();
  for (const group of planGroups.values()) {
    const p = routePlan.get(group.matchKey) ?? { weekly: 0, total: 0 };
    p.weekly += group.planWeekly;
    p.total += group.planWeekly + group.planDaily;
    routePlan.set(group.matchKey, p);
  }

  // ±1-day matching: only actual groups with no plan at all on their own
  // date are candidates, and only toward a plan date that is still short on
  // its exact-date actual (crediting a target that is already full adds
  // nothing but noise). A stored decision's own target wins over a fresh
  // suggestion, as long as that target is still planned.
  interface ShiftCandidate {
    targetKey: string;
    targetPlanDate: string;
    offset: DayOffset;
  }
  const shiftCandidates = new Map<string, ShiftCandidate>();
  const shiftedIn = new Map<string, number>();
  const notesByKey = new Map<string, string[]>();
  for (const [key, weight] of actualByKey) {
    if (matchedKeys.has(key)) continue;
    const first = actualRowsByKey.get(key)![0];
    const candidateFor = (offset: DayOffset): ShiftCandidate => {
      const targetPlanDate = shiftIsoDate(first.transferDate, -offset);
      return { targetKey: matchKey(targetPlanDate, first.originCode, first.destCode, first.productGroup), targetPlanDate, offset };
    };
    const decision = dateShiftDecisions.get(key);
    let candidate: ShiftCandidate | undefined;
    if (decision) {
      candidate = DATE_SHIFT_OFFSETS.map(candidateFor).find((c) => c.targetPlanDate === decision.targetPlanDate);
      if (candidate && (routePlan.get(candidate.targetKey)?.total ?? 0) <= 0) candidate = undefined;
    }
    if (!candidate) {
      candidate = DATE_SHIFT_OFFSETS.map(candidateFor).find((c) => {
        const plan = routePlan.get(c.targetKey)?.total ?? 0;
        return plan > 0 && (actualByKey.get(c.targetKey) ?? 0) < plan;
      });
    }
    if (!candidate) continue;
    shiftCandidates.set(key, candidate);

    const status = decision?.targetPlanDate === candidate.targetPlanDate ? decision.decision : 'pending';
    if (status === 'rejected') continue;
    const where = `วันที่ ${formatDayMonth(first.transferDate)} (${offsetLabel(candidate.offset)}) ${weight.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`;
    const note =
      status === 'confirmed'
        ? `รวมโอนจริง${where} — ยืนยันโดย ${decision!.decidedByName ?? '-'}`
        : `พบโอนจริง${where} — รอยืนยัน`;
    if (status === 'confirmed') shiftedIn.set(candidate.targetKey, (shiftedIn.get(candidate.targetKey) ?? 0) + weight);
    const notes = notesByKey.get(candidate.targetKey);
    if (notes) notes.push(note);
    else notesByKey.set(candidate.targetKey, [note]);
  }

  const results: TrackingResult[] = [];
  for (const group of planGroups.values()) {
    // Not deleted after use: two price-variant rows for the same route both
    // look up the same, undepleted actual total (see fullGroupKey above).
    const actualRaw = (actualByKey.get(group.matchKey) ?? 0) + (shiftedIn.get(group.matchKey) ?? 0);
    const adjustment = adjustments.get(group.matchKey);
    const actualTotal = adjustment ? adjustment.newActual : actualRaw;
    const routePlanWeekly = routePlan.get(group.matchKey)!.weekly;
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
      actualOriginal: adjustment ? actualRaw : null,
      isAdjusted: !!adjustment,
      adjustedBy: adjustment?.adjustedBy ?? null,
      adjustedByName: adjustment?.adjustedByName ?? null,
      adjustedAt: adjustment?.adjustedAt ?? null,
      adjustmentReason: adjustment?.reason ?? null,
      weekly: computeChannel(channelActual(actualTotal, routePlanWeekly, 'weekly'), group.planWeekly),
      daily: computeChannel(channelActual(actualTotal, routePlanWeekly, 'daily'), group.planDaily),
      total: computeChannel(actualTotal, planTotal),
      overage: Math.max(actualTotal - planTotal, 0),
      // `=== 0 ? 0 : x` normalizes -0 (e.g. -1 * 0) to plain 0 — cosmetic in
      // Postgres (numeric has no signed zero) but matters for the frontend's
      // own mirror of this formula (rowCalc.ts), which renders a live
      // preview straight from JS without a DB round-trip to normalize it.
      profitRealized: normalizeZero((group.destPrice - group.originPrice) * actualTotal),
      profitLost: normalizeZero(-Math.max(0, planTotal - actualTotal) * Math.max(0, group.destPrice - group.originPrice)),
      suggestWeekly: group.suggestWeekly,
      suggestDaily: group.suggestDaily,
      suggestTotal,
      rejectWeekly,
      rejectDaily,
      rejectTotal,
      rejectPct: suggestTotal > 0 ? rejectTotal / suggestTotal : null,
      systemNote: notesByKey.get(group.matchKey)?.join('\n') ?? null,
    });
  }

  const unmatchedActual: UnmatchedActual[] = [];
  for (const [key, totalWeightKg] of actualByKey) {
    if (matchedKeys.has(key)) continue; // at least one plan group (any price variant) covers this route/date/group
    const candidate = shiftCandidates.get(key);
    const decision = dateShiftDecisions.get(key);
    const shiftStatus = !candidate ? null : decision?.targetPlanDate === candidate.targetPlanDate ? decision.decision : 'pending';
    if (shiftStatus === 'confirmed') continue; // credited to its plan date instead
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
      suggestedPlanDate: candidate?.targetPlanDate ?? null,
      dayOffset: candidate?.offset ?? null,
      shiftStatus,
    });
  }

  return { results, unmatchedActual };
}

export interface ChannelAggregate extends ChannelResult {
  planSum: number;
}

function routeKeyOf(r: TrackingResult): string {
  return matchKey(r.productionDate, r.originCode, r.destCode, r.productGroup);
}

/**
 * Groups rows by (productionDate, originCode, destCode, productGroup) —
 * collapsing the price-variant split back down to one entry per physical
 * route/date/group. actualTotal is identical across every price-variant row
 * sharing a route (see computeTracking's matchKey), so it must be counted
 * once per group, never once per row, or a route with N price points gets
 * its actual weight credited N times.
 */
function groupByRoute(results: TrackingResult[]): Map<string, TrackingResult[]> {
  const groups = new Map<string, TrackingResult[]>();
  for (const r of results) {
    const key = routeKeyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/**
 * Ratio-of-sums aggregation, matching Excel's SUBTOTAL(9,...) grand totals and
 * the Summary sheet's pivot calculated field IFERROR(SUM(X)/SUM(M),0).
 * Never average the per-row `pct` values directly — that would weight every
 * route equally regardless of volume, which is not what the workbook does.
 *
 * Recomputes capped/toleranceAdj per physical route (summing plan across its
 * price variants, but taking actual once) rather than summing the stored
 * per-row values — otherwise a route with N price points would have its
 * actual credited N times, inflating the aggregate % (Excel has this same
 * defect at the grand-total level; this engine deliberately does not
 * reproduce it there, even though each row's own stored figures still do,
 * since they're independently meaningful per price segment).
 */
export function aggregateChannel(results: TrackingResult[], channel: Channel): ChannelAggregate {
  const planKey = channel === 'weekly' ? 'planWeekly' : channel === 'daily' ? 'planDaily' : 'planTotal';
  let planSum = 0;
  let cappedSum = 0;
  let toleranceAdjSum = 0;
  for (const routeRows of groupByRoute(results).values()) {
    const plan = sum(routeRows.map((r) => r[planKey]));
    const routePlanWeekly = sum(routeRows.map((r) => r.planWeekly));
    // actualTotal is identical across every price variant of this route
    const actual = channelActual(routeRows[0].actualTotal, routePlanWeekly, channel);
    const { capped, toleranceAdj } = computeChannel(actual, plan);
    planSum += plan;
    cappedSum += capped;
    toleranceAdjSum += toleranceAdj;
  }
  return {
    planSum,
    capped: cappedSum,
    toleranceAdj: toleranceAdjSum,
    diff: toleranceAdjSum - planSum,
    pct: planSum > 0 ? toleranceAdjSum / planSum : null,
  };
}

/**
 * Total actual-transfer weight across the given rows, counted once per
 * physical route (date/origin/dest/productGroup) — never once per
 * price-variant row, since those rows deliberately share the same actual
 * pool (see computeTracking's matchKey).
 */
export function dedupedActualTotal(results: TrackingResult[]): number {
  const seen = new Map<string, number>();
  for (const r of results) {
    const key = routeKeyOf(r);
    if (!seen.has(key)) seen.set(key, r.actualTotal);
  }
  return sum(Array.from(seen.values()));
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
