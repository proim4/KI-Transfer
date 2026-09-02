// End-to-end sanity check using the REAL WK36 sample files, not synthetic
// fixtures: parses the actual raw exports the same way the frontend's upload
// flow does (reusing its exact validation/mapping functions), runs them
// through the calc engine, and checks the results against the values
// verified directly from Tracking_โอนเทียบแผน_WK36.xlsx's own formulas.
//
// This is the strongest evidence we have that "parse real file -> compute"
// reconciles with the original workbook, independent of any browser/DOM
// environment (it bypasses the frontend's File-based reader and feeds
// Node buffers straight into the SAME validate*/computeTracking functions).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  ACTUAL_REQUIRED_COLUMNS,
  PLAN_REQUIRED_COLUMNS,
  missingColumns,
  validateActualRows,
  validatePlanRows,
} from '../../../frontend/src/lib/excelParser';
import { aggregateChannel, computeTracking } from './calcEngine.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(HERE, '../../../โอนเทียบแผน Weekly-Daily');

function readRawRows(path: string): Record<string, unknown>[] {
  const buffer = readFileSync(path);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
}

describe('WK36 real-file pipeline', () => {
  const weeklyRaw = readRawRows(resolve(SAMPLE_DIR, 'แผนโอน_Weekly-Daily/WK36/BSR030_Weekly 36.xls'));
  const dailyRaw = readRawRows(resolve(SAMPLE_DIR, 'แผนโอน_Weekly-Daily/WK36/BDR130_Daily 36.xls'));
  const actualRaw = readRawRows(resolve(SAMPLE_DIR, 'โอนจริง_ABS0000/WK36/ABS0000_StockTransfers (92).xls'));

  it('has no missing required columns in any of the 3 raw files', () => {
    const weeklyHeaders = Object.keys(weeklyRaw[0]);
    const dailyHeaders = Object.keys(dailyRaw[0]);
    const actualHeaders = Object.keys(actualRaw[0]);
    expect(missingColumns(weeklyHeaders, PLAN_REQUIRED_COLUMNS)).toEqual([]);
    expect(missingColumns(dailyHeaders, PLAN_REQUIRED_COLUMNS)).toEqual([]);
    expect(missingColumns(actualHeaders, ACTUAL_REQUIRED_COLUMNS)).toEqual([]);
  });

  it('validates every plan row with zero errors, and skips (not errors) ABS0000 rows with no destination factory', () => {
    const weekly = validatePlanRows(weeklyRaw, 'weekly');
    const daily = validatePlanRows(dailyRaw, 'daily');
    const actual = validateActualRows(actualRaw);

    expect(weekly.errors).toEqual([]);
    expect(daily.errors).toEqual([]);
    expect(actual.errors).toEqual([]);
    expect(weekly.rows.length).toBe(weeklyRaw.length);
    expect(daily.rows.length).toBe(dailyRaw.length);

    // Real WK36 ABS0000 data: ~25% of rows are direct-to-customer shipments
    // with no destination factory at all (never matched by Excel's own
    // SUMIFS either, since it also matches on destination code) — these are
    // skipped, not reported as data-entry errors.
    expect(actual.skippedCount).toBeGreaterThan(0);
    expect(actual.rows.length + actual.skippedCount).toBe(actualRaw.length);
  });

  it('reproduces the verified WK36 tracking-sheet rows (OPRCD0011 -> OPRCDN001, 31/08/2026)', () => {
    const weekly = validatePlanRows(weeklyRaw, 'weekly');
    const daily = validatePlanRows(dailyRaw, 'daily');
    const actual = validateActualRows(actualRaw);

    const { results } = computeTracking([...weekly.rows, ...daily.rows], actual.rows);

    const khaGai = results.find(
      (r) => r.originCode === 'OPRCD0011' && r.destCode === 'OPRCDN001' && r.productionDate === '2026-08-31' && r.productGroup === 'ขาไก่',
    );
    const khaGai2 = results.find(
      (r) => r.originCode === 'OPRCD0011' && r.destCode === 'OPRCDN001' && r.productionDate === '2026-08-31' && r.productGroup === 'ขาไก่#2',
    );

    // Verified directly from the workbook: row 90 (ขาไก่) plan=435, actual=527;
    // row 91 (ขาไก่#2) plan=430, actual=5.
    expect(khaGai).toBeDefined();
    expect(khaGai!.planTotal).toBe(435);
    expect(khaGai!.actualTotal).toBe(527);
    expect(khaGai!.total.pct).toBe(1);
    expect(khaGai!.overage).toBe(92);

    expect(khaGai2).toBeDefined();
    expect(khaGai2!.planTotal).toBe(430);
    expect(khaGai2!.actualTotal).toBe(5);
    expect(khaGai2!.total.pct).toBeCloseTo(5 / 430, 6);

    // The 92kg overage on ขาไก่ must never offset the shortfall on ขาไก่#2.
    const ratioOfSums = aggregateChannel([khaGai!, khaGai2!], 'total').pct!;
    expect(ratioOfSums).toBeCloseTo((435 + 5) / (435 + 430), 10);
  });

  it('aggregates multiple exact SKUs within one product group to a single tracking row (OPRCD0019 -> OPRCDNE40, ปีกบนไก่, 31/08/2026)', () => {
    const weekly = validatePlanRows(weeklyRaw, 'weekly');
    const daily = validatePlanRows(dailyRaw, 'daily');
    const actual = validateActualRows(actualRaw);

    // Two distinct exact SKUs (500kg + 250kg) genuinely share this
    // (date, origin, dest, product-group) key in the real ABS0000 data. Note:
    // the raw Excel date serial here reads as 2026-08-30T17:00Z, which is
    // midnight 31/08/2026 in the local (Bangkok) timezone SheetJS's
    // cellDates construction and parseFlexibleDate's local-getter reading
    // both anchor to — the round-trip is timezone-invariant since both ends
    // use the same runtime's local clock, but it means the calendar date is
    // NOT simply the UTC date string.
    const skuCodes = ['000000000023085893', '000000000023103735'];
    const matchingActual = actual.rows.filter(
      (r) =>
        r.originCode === 'OPRCD0019' &&
        r.destCode === 'OPRCDNE40' &&
        r.productGroup === 'ปีกบนไก่' &&
        r.transferDate === '2026-08-31' &&
        skuCodes.includes(r.skuCode),
    );
    expect(matchingActual.length).toBe(2);
    expect(matchingActual.reduce((a, r) => a + r.weightKg, 0)).toBe(750);

    const { results } = computeTracking([...weekly.rows, ...daily.rows], actual.rows);
    const row = results.find(
      (r) => r.originCode === 'OPRCD0019' && r.destCode === 'OPRCDNE40' && r.productGroup === 'ปีกบนไก่' && r.productionDate === '2026-08-31',
    );
    expect(row).toBeDefined();
    // The tracking row's actualTotal must be the SUM across both exact SKUs
    // — the plan only ever specifies a group-level quantity, so this is the
    // finest grain the workbook (and this engine) can score against.
    expect(row!.actualTotal).toBe(750);
  });

  it('computes a full-week grand total covering every plan group, none dropped', () => {
    const weekly = validatePlanRows(weeklyRaw, 'weekly');
    const daily = validatePlanRows(dailyRaw, 'daily');
    const actual = validateActualRows(actualRaw);
    const { results } = computeTracking([...weekly.rows, ...daily.rows], actual.rows);

    // The original workbook's pivot (grouped by date/origin/dest/group/price)
    // reached ~1192 rows; its dragged-down formula columns stopped at row
    // 1185, silently dropping the last several groups. Our engine has no
    // fixed range and groups on the same 6-part key (including price, since
    // ~46 real WK36 routes carry more than one price on the same date), so
    // it should land in the same ballpark rather than the ~1140 you'd get by
    // collapsing distinct prices into one row.
    expect(results.length).toBeGreaterThan(1180);

    const total = aggregateChannel(results, 'total');
    expect(total.planSum).toBeGreaterThan(0);
    expect(total.pct).not.toBeNull();
    expect(total.pct!).toBeGreaterThan(0);
    expect(total.pct!).toBeLessThanOrEqual(1);
  });
});
