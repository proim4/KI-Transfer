import { describe, expect, it } from 'vitest';
import { summarizeChannel } from './summaryAggregate';
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
    actual_alloc: 0,
    route_plan_weekly: 0,
    route_plan_daily: 0,
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
    remark: null,
    system_note: null,
    actual_original: null,
    is_adjusted: false,
    adjusted_by: null,
    adjusted_by_name: null,
    adjusted_at: null,
    adjustment_reason: null,
    created_at: '2026-08-31T00:00:00Z',
    ...overrides,
  };
}

describe('summarizeChannel', () => {
  const rows = [
    // Weekly-only route, day 1, dest A: 100 plan, 50 moved
    row({ id: 1, production_date: '2026-08-31', dest_code: 'A', dest_name: 'Plant A', plan_weekly: 100, plan_total: 100, actual_total: 50, actual_alloc: 50, route_plan_weekly: 100 }),
    // Weekly-only route, day 2, dest B: 200 plan, fully moved
    row({ id: 2, production_date: '2026-09-01', dest_code: 'B', dest_name: 'Plant B', plan_weekly: 200, plan_total: 200, actual_total: 200, actual_alloc: 200, route_plan_weekly: 200 }),
    // Daily-only route, day 1, dest B — must not show up in the Weekly summary
    row({ id: 3, production_date: '2026-08-31', dest_code: 'B', dest_name: 'Plant B', product_group: 'ขาไก่', plan_daily: 80, plan_total: 80, actual_total: 0, actual_alloc: 0, route_plan_daily: 80 }),
  ];

  it('scopes to the channel and groups by date and destination', () => {
    const s = summarizeChannel(rows, 'weekly');
    expect(s.byDate.map((g) => [g.key, g.planSum, g.toleranceAdjSum])).toEqual([
      ['2026-08-31', 100, 50],
      ['2026-09-01', 200, 200],
    ]);
    expect(s.byDest.map((g) => [g.key, g.name, g.planSum])).toEqual([
      ['A', 'Plant A', 100],
      ['B', 'Plant B', 200],
    ]);
    expect(s.total.planSum).toBe(300);
    expect(s.total.toleranceAdjSum).toBe(250);
    expect(s.total.diff).toBe(-50);
  });

  it('groups add up to the grand total', () => {
    for (const channel of ['weekly', 'daily'] as const) {
      const s = summarizeChannel(rows, channel);
      for (const groups of [s.byDate, s.byDest]) {
        expect(groups.reduce((a, g) => a + g.planSum, 0)).toBe(s.total.planSum);
        expect(groups.reduce((a, g) => a + g.toleranceAdjSum, 0)).toBeCloseTo(s.total.toleranceAdjSum, 10);
      }
    }
    expect(summarizeChannel(rows, 'daily').total.pct).toBe(0);
  });
});
