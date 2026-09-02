import { describe, expect, it } from 'vitest';
import { aggregateChannel, aggregateReject, computeChannel, computeTracking, dedupedActualTotal } from './calcEngine.ts';
import type { ActualRow, PlanRow } from './types.ts';

function planRow(overrides: Partial<PlanRow>): PlanRow {
  return {
    sourceFile: 'weekly',
    productionDate: '2026-08-31',
    originCode: 'OPRCD0011',
    originName: 'Origin',
    destCode: 'OPRCDN001',
    destName: 'Dest',
    productGroup: 'ขาไก่',
    originPrice: 0,
    destPrice: 0,
    suggest: 0,
    supplyAfter: 0,
    ...overrides,
  };
}

function actualRow(overrides: Partial<ActualRow>): ActualRow {
  return {
    originCode: 'OPRCD0011',
    originName: 'Origin',
    destCode: 'OPRCDN001',
    destName: 'Dest',
    transferDate: '2026-08-31',
    skuCode: 'SKU',
    skuName: 'SKU name',
    weightKg: 0,
    productGroup: 'ขาไก่',
    ...overrides,
  };
}

describe('computeChannel', () => {
  it('caps at plan and reproduces the real WK36 overage row (ขาไก่: plan=435, actual=527)', () => {
    // Verified from Tracking_โอนเทียบแผน_WK36.xlsx row 90: W90=MIN(527,435)=435,
    // diff=0 < 10%*435 -> X90=435 (100%).
    const result = computeChannel(527, 435);
    expect(result.capped).toBe(435);
    expect(result.toleranceAdj).toBe(435);
    expect(result.diff).toBe(0);
    expect(result.pct).toBe(1);
  });

  it('reproduces the real WK36 shortfall row (ขาไก่#2: plan=430, actual=5)', () => {
    // Verified from row 91: W91=MIN(5,430)=5, diff=425 not < 43 -> X91=5 (~1.16%).
    const result = computeChannel(5, 430);
    expect(result.capped).toBe(5);
    expect(result.toleranceAdj).toBe(5);
    expect(result.diff).toBe(-425);
    expect(result.pct).toBeCloseTo(5 / 430, 10);
  });

  it('applies the 10% tolerance round-up when the shortfall is small', () => {
    // shortfall = 100 - 95 = 5, which is < 10% of 100 -> rounds up to full plan.
    const result = computeChannel(95, 100);
    expect(result.toleranceAdj).toBe(100);
    expect(result.pct).toBe(1);
  });

  it('does not round up when the shortfall is at or above 10%', () => {
    // shortfall = 100 - 89 = 11, not < 10 -> stays capped, not rounded.
    const result = computeChannel(89, 100);
    expect(result.toleranceAdj).toBe(89);
    expect(result.pct).toBe(0.89);
  });

  it('never exceeds 100% even when actual is far above plan', () => {
    const result = computeChannel(10000, 100);
    expect(result.capped).toBe(100);
    expect(result.toleranceAdj).toBe(100);
    expect(result.pct).toBe(1);
  });

  it('returns null pct (displayed as "-") when plan is zero', () => {
    const result = computeChannel(50, 0);
    expect(result.pct).toBeNull();
    expect(result.capped).toBe(0);
  });
});

describe('computeTracking', () => {
  it('scores distinct product groups on the same factory pair independently (no cross-group offset)', () => {
    // Reproduces the verified WK36 case: a 92kg overage on "ขาไก่" must never
    // offset the shortfall on the sibling group "ขาไก่#2".
    const plans = [
      planRow({ productGroup: 'ขาไก่', supplyAfter: 435 }),
      planRow({ productGroup: 'ขาไก่#2', supplyAfter: 430 }),
    ];
    const actuals = [
      actualRow({ productGroup: 'ขาไก่', weightKg: 527 }),
      actualRow({ productGroup: 'ขาไก่#2', weightKg: 5 }),
    ];

    const { results } = computeTracking(plans, actuals);
    const byGroup = Object.fromEntries(results.map((r) => [r.productGroup, r]));

    expect(byGroup['ขาไก่'].total.pct).toBe(1);
    expect(byGroup['ขาไก่'].overage).toBe(92);
    expect(byGroup['ขาไก่#2'].total.pct).toBeCloseTo(5 / 430, 10);

    // Ratio-of-sums must differ from a naive average of the two rows' pct.
    const ratioOfSums = aggregateChannel(results, 'total').pct!;
    const naiveAverage = (byGroup['ขาไก่'].total.pct! + byGroup['ขาไก่#2'].total.pct!) / 2;
    expect(ratioOfSums).not.toBeCloseTo(naiveAverage, 5);
    expect(ratioOfSums).toBeCloseTo((435 + 5) / (435 + 430), 10);
  });

  it('splits weekly vs daily plan and sums them into total', () => {
    const plans = [
      planRow({ sourceFile: 'weekly', supplyAfter: 100 }),
      planRow({ sourceFile: 'daily', supplyAfter: 50 }),
    ];
    const actuals = [actualRow({ weightKg: 120 })];

    const { results } = computeTracking(plans, actuals);
    expect(results).toHaveLength(1);
    const [row] = results;
    expect(row.planWeekly).toBe(100);
    expect(row.planDaily).toBe(50);
    expect(row.planTotal).toBe(150);
    expect(row.weekly.pct).toBe(1); // 120 actual caps the 100 weekly plan at 100%
    expect(row.daily.pct).toBe(1); // 120 actual also caps the 50 daily plan at 100%
    // Total: capped=MIN(120,150)=120, shortfall=30 is NOT < 10%*150=15, so no
    // tolerance round-up -> pct=120/150=0.8. Each channel is capped against the
    // SAME actualTotal independently, so weekly/daily can both read 100% while
    // total (a stricter, larger denominator) does not.
    expect(row.total.pct).toBeCloseTo(0.8, 10);
  });

  it('computes profit realized (uncapped) and profit lost (uncapped, no tolerance grace)', () => {
    const plans = [planRow({ supplyAfter: 100, originPrice: 10, destPrice: 15 })];
    const actuals = [actualRow({ weightKg: 91 })]; // within the 10% tolerance -> pct reads 100%
    const { results } = computeTracking(plans, actuals);
    const [row] = results;

    expect(row.total.pct).toBe(1); // tolerance rounds this up to "on plan"
    // But profit lost must still reflect the raw 9kg shortfall x margin 5 = -45,
    // deliberately NOT forgiven by the tolerance rule (matches Excel's AC formula).
    expect(row.profitLost).toBe(-45);
    expect(row.profitRealized).toBe(5 * 91);
  });

  it('flags actual transfers with no matching plan row as unmatched, not silently dropped', () => {
    const plans = [planRow({ productGroup: 'ขาไก่', supplyAfter: 100 })];
    const actuals = [
      actualRow({ productGroup: 'ขาไก่', weightKg: 100 }),
      actualRow({ productGroup: 'สินค้าที่ไม่มีในแผน', weightKg: 42 }),
    ];

    const { results, unmatchedActual } = computeTracking(plans, actuals);
    expect(results).toHaveLength(1);
    expect(unmatchedActual).toHaveLength(1);
    expect(unmatchedActual[0].productGroup).toBe('สินค้าที่ไม่มีในแผน');
    expect(unmatchedActual[0].totalWeightKg).toBe(42);
  });

  it('does not credit the same actual pool once per price-variant row when aggregating (real WK36 pattern: ~46 routes carry 2+ prices)', () => {
    // Same route/date/group, two price points (e.g. a mid-week price change)
    // -> two separate tracking rows, each independently capped against the
    // SAME undivided actual pool (this matches Excel's own SUMIFS, which
    // never references price). Only 300kg of the combined 500kg plan (300+200)
    // actually moved.
    const plans = [
      planRow({ productGroup: 'ตับไก่', originPrice: 90, destPrice: 88, supplyAfter: 300 }),
      planRow({ productGroup: 'ตับไก่', originPrice: 94, destPrice: 85, supplyAfter: 200 }),
    ];
    const actuals = [actualRow({ productGroup: 'ตับไก่', weightKg: 300 })];
    const { results } = computeTracking(plans, actuals);

    expect(results).toHaveLength(2); // two distinct price-variant rows
    expect(results[0].actualTotal).toBe(300);
    expect(results[1].actualTotal).toBe(300); // same shared pool, not split

    // Naively summing each row's own stored capped/toleranceAdj would give
    // 100% (300/300 + 200/200 both read as fully achieved) — this is the bug.
    const naiveInflatedPct = (results[0].total.toleranceAdj + results[1].total.toleranceAdj) / (300 + 200);
    expect(naiveInflatedPct).toBe(1);

    // The de-duplicated aggregate must instead cap the ONE real 300kg
    // against the combined 500kg plan: 60%, not 100%.
    const agg = aggregateChannel(results, 'total');
    expect(agg.planSum).toBe(500);
    expect(agg.toleranceAdj).toBe(300);
    expect(agg.pct).toBeCloseTo(0.6, 10);

    expect(dedupedActualTotal(results)).toBe(300);
  });
});

describe('reject (suggest vs finalized plan)', () => {
  it('computes reject qty as the portion of the suggestion cut from the final plan', () => {
    const plans = [planRow({ sourceFile: 'weekly', suggest: 120, supplyAfter: 100 })];
    const { results } = computeTracking(plans, []);
    const [row] = results;
    expect(row.suggestWeekly).toBe(120);
    expect(row.rejectWeekly).toBe(20);
    expect(row.rejectTotal).toBe(20);
    expect(row.rejectPct).toBeCloseTo(20 / 120, 10);
  });

  it('never reports a negative reject when the final plan exceeds the suggestion', () => {
    const plans = [planRow({ sourceFile: 'weekly', suggest: 80, supplyAfter: 100 })];
    const { results } = computeTracking(plans, []);
    expect(results[0].rejectWeekly).toBe(0);
  });

  it('aggregates reject as ratio-of-sums across groups', () => {
    const plans = [
      planRow({ productGroup: 'A', sourceFile: 'weekly', suggest: 100, supplyAfter: 80 }),
      planRow({ productGroup: 'B', sourceFile: 'weekly', suggest: 200, supplyAfter: 200 }),
    ];
    const { results } = computeTracking(plans, []);
    const agg = aggregateReject(results, 'weekly');
    expect(agg.suggestSum).toBe(300);
    expect(agg.rejectSum).toBe(20);
    expect(agg.pct).toBeCloseTo(20 / 300, 10);
  });
});
