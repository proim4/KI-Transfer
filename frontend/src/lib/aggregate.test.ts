import { describe, expect, it } from 'vitest';
import { aggregateChannel, dedupedActualTotal } from './aggregate';
import type { TrackingResultRow } from '../types/db';

function row(overrides: Partial<TrackingResultRow>): TrackingResultRow {
  return {
    id: 0,
    week_id: 'week-1',
    production_date: '2026-08-31',
    origin_code: 'OPRCD0011',
    origin_name: 'Origin',
    dest_code: 'OPRCDN001',
    dest_name: 'Dest',
    product_group: 'ตับไก่',
    origin_price: 0,
    dest_price: 0,
    plan_weekly: 0,
    plan_daily: 0,
    plan_total: 0,
    actual_total: 0,
    weekly_capped: 0,
    weekly_tolerance_adj: 0,
    weekly_diff: 0,
    weekly_pct: null,
    daily_capped: 0,
    daily_tolerance_adj: 0,
    daily_diff: 0,
    daily_pct: null,
    total_capped: 0,
    total_tolerance_adj: 0,
    total_diff: 0,
    total_pct: null,
    overage: 0,
    profit_realized: 0,
    profit_lost: 0,
    suggest_weekly: 0,
    suggest_daily: 0,
    suggest_total: 0,
    reject_weekly: 0,
    reject_daily: 0,
    reject_total: 0,
    reject_pct: null,
    created_at: '2026-08-31T00:00:00Z',
    ...overrides,
  };
}

describe('aggregateChannel / dedupedActualTotal (price-variant routes)', () => {
  it('does not credit the same actual pool once per price-variant row', () => {
    // Mirrors supabase/functions/_shared/calcEngine.test.ts's equivalent
    // case: same route/date/group at two prices, one shared 300kg actual
    // pool against a combined 500kg plan (300+200) — only 60% really moved.
    const rows = [
      row({ id: 1, origin_price: 90, dest_price: 88, plan_total: 300, actual_total: 300 }),
      row({ id: 2, origin_price: 94, dest_price: 85, plan_total: 200, actual_total: 300 }),
    ];

    const agg = aggregateChannel(rows, 'total');
    expect(agg.planSum).toBe(500);
    expect(agg.toleranceAdjSum).toBe(300);
    expect(agg.pct).toBeCloseTo(0.6, 10);

    expect(dedupedActualTotal(rows)).toBe(300);
  });

  it('sums plan and actual normally across genuinely distinct routes', () => {
    const rows = [
      row({ id: 1, product_group: 'ขาไก่', plan_total: 100, actual_total: 100 }),
      row({ id: 2, product_group: 'ขาไก่#2', plan_total: 50, actual_total: 50 }),
    ];
    const agg = aggregateChannel(rows, 'total');
    expect(agg.planSum).toBe(150);
    expect(dedupedActualTotal(rows)).toBe(150);
  });
});
