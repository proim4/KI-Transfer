import { describe, expect, it } from 'vitest';
import {
  aggregateActualOut,
  aggregatePlanOut,
  computeSupplyDailyResults,
  countOffPlanOffZoneRows,
} from './supplyDailyCalcEngine.ts';
import type { ActualRow, BiddingRow, PlanRow, PricingRow, SupplyDailyMasterData, SupplyDailyRow } from './types.ts';

function supplyRow(overrides: Partial<SupplyDailyRow>): SupplyDailyRow {
  return {
    productionDate: '2026-08-27',
    originCode: 'OPRCDS111',
    originName: 'Origin Factory',
    productGroup: 'BBไก่',
    productGroupCustom: 'BBไก่(BBไก่)',
    remainingQty: 0,
    ...overrides,
  };
}

function planRow(overrides: Partial<PlanRow>): PlanRow {
  return {
    sourceFile: 'daily',
    productionDate: '2026-08-27',
    originCode: 'OPRCDS111',
    originName: 'Origin Factory',
    destCode: 'OPRCD0007',
    destName: 'Dest Factory',
    productGroup: 'BBไก่',
    originPrice: 0,
    destPrice: 0,
    suggest: 0,
    supplyAfter: 0,
    ...overrides,
  };
}

function actualRow(overrides: Partial<ActualRow>): ActualRow {
  return {
    originCode: 'OPRCDS111',
    originName: 'Origin Factory',
    destCode: 'OPRCD0007',
    destName: 'Dest Factory',
    transferDate: '2026-08-27',
    skuCode: 'SKU1',
    skuName: 'SKU name',
    weightKg: 0,
    productGroup: 'BBไก่',
    ...overrides,
  };
}

function masterData(overrides: Partial<SupplyDailyMasterData> = {}): SupplyDailyMasterData {
  return {
    specialSkuNames: new Set(),
    tollProcessingPairs: new Set(),
    factoryZoneByCode: new Map([
      ['OPRCDS111', 'ใต้'],
      ['OPRCD0007', 'กทม.'],
    ]),
    vendorGroupByFactoryCode: new Map([['OPRCDS111', 'SOT_ไก่_1']]),
    ...overrides,
  };
}

describe('aggregatePlanOut', () => {
  it('sums supplyAfter across every destination for the same (date, origin, productGroup) — BSD010 carries no destination dimension', () => {
    const rows = [
      planRow({ destCode: 'OPRCD0007', supplyAfter: 300 }),
      planRow({ destCode: 'OPRCDNE20', supplyAfter: 200 }),
    ];
    const result = aggregatePlanOut(rows);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBe(500);
  });

  it('excludes weekly-sourced (BSR030) plan rows — the source workbook has no BSR030 query at all, only BDR130 (daily)', () => {
    // Confirmed against real WK35 data: including weekly rows overcounted
    // "แผนโอนออก" by exactly the weekly contribution.
    const rows = [
      planRow({ sourceFile: 'daily', destCode: 'OPRCD0007', supplyAfter: 300 }),
      planRow({ sourceFile: 'weekly', destCode: 'OPRCD0011', supplyAfter: 9999 }),
    ];
    const result = aggregatePlanOut(rows);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBe(300);
  });
});

describe('aggregateActualOut', () => {
  it('excludes rows whose SKU name is in the special-SKU list, mirroring Check Sku พิเศษ', () => {
    const md = masterData({ specialSkuNames: new Set(['พิเศษ SKU']) });
    const rows = [actualRow({ weightKg: 100 }), actualRow({ skuName: 'พิเศษ SKU', weightKg: 9999 })];
    const result = aggregateActualOut(rows, md);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBe(100);
  });

  it('excludes rows whose (origin,dest) name pair is a registered ฝากตัดแต่ง (toll-processing) pair', () => {
    const md = masterData({ tollProcessingPairs: new Set(['Origin Factory::Dest Factory']) });
    const rows = [actualRow({ weightKg: 500 })];
    const result = aggregateActualOut(rows, md);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBeUndefined();
  });

  it('excludes rows whose origin or dest factory has no resolvable zone, mirroring Check โรงต้นทาง/Check โรงปลายทาง', () => {
    const md = masterData({ factoryZoneByCode: new Map([['OPRCDS111', 'ใต้']]) }); // dest missing
    const rows = [actualRow({ weightKg: 500 })];
    const result = aggregateActualOut(rows, md);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBeUndefined();
  });
});

describe('countOffPlanOffZoneRows', () => {
  it('only counts rows for a key already flagged off-plan that also cross a zone boundary', () => {
    const md = masterData(); // OPRCDS111=ใต้, OPRCD0007=กทม. -> different zones
    const rows = [actualRow({ weightKg: 100 })];
    const offPlanKeys = new Set(['2026-08-27|OPRCDS111|BBไก่']);
    const result = countOffPlanOffZoneRows(rows, md, offPlanKeys);
    expect(result.get('2026-08-27|OPRCDS111|BBไก่')).toBe(1);
  });

  it('does not count a same-zone transfer even if off-plan', () => {
    const md = masterData({
      factoryZoneByCode: new Map([
        ['OPRCDS111', 'ใต้'],
        ['OPRCD0007', 'ใต้'],
      ]),
    });
    const rows = [actualRow({ weightKg: 100 })];
    const offPlanKeys = new Set(['2026-08-27|OPRCDS111|BBไก่']);
    const result = countOffPlanOffZoneRows(rows, md, offPlanKeys);
    expect(result.size).toBe(0);
  });

  it('does not count a key that is not flagged off-plan', () => {
    const md = masterData();
    const rows = [actualRow({ weightKg: 100 })];
    const result = countOffPlanOffZoneRows(rows, md, new Set());
    expect(result.size).toBe(0);
  });
});

describe('computeSupplyDailyResults', () => {
  it('reproduces the "check โอนนอกแผน" formula: IF(F<0,0,IF(I-G>H+100,1,0))', () => {
    // F=1000 (remaining), G=400 (plan out) -> H=600 (remaining after plan).
    // actual(I)=1200: I-G=800 > H+100=700 -> off-plan.
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 1000 })],
      [planRow({ supplyAfter: 400 })],
      [actualRow({ weightKg: 1200 })],
      [],
      [],
      masterData(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].remainingAfterPlan).toBe(600);
    expect(results[0].isOffPlan).toBe(true);
  });

  it('is not off-plan when the shortfall stays within the 100kg tolerance', () => {
    // I-G=800-400=400, H+100=600+100=700 -> 400 is not > 700 -> not off-plan.
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 1000 })],
      [planRow({ supplyAfter: 400 })],
      [actualRow({ weightKg: 800 })],
      [],
      [],
      masterData(),
    );
    expect(results[0].isOffPlan).toBe(false);
  });

  it('never flags off-plan when remaining supply is negative, per IF(F<0,0,...)', () => {
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: -50 })],
      [planRow({ supplyAfter: 0 })],
      [actualRow({ weightKg: 99999 })],
      [],
      [],
      masterData(),
    );
    expect(results[0].isOffPlan).toBe(false);
  });

  it('sums remainingQty across duplicate supply rows for the same key, rather than keeping only the last one seen', () => {
    // Confirmed against real WK35 data: BSD010 can carry more than one raw
    // row for the same (date, origin, productGroup) — the workbook's own
    // pivot field for this ("ปริมาณของเหลือ") is itself a SUM, and taking
    // only the last row silently halved this figure wherever a key had two
    // contributing rows.
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 400 }), supplyRow({ remainingQty: 600 })],
      [],
      [],
      [],
      [],
      masterData(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].remainingQty).toBe(1000);
  });

  it('includes a key with a plan/actual but no filed supply row at all, marking filed=false', () => {
    const results = computeSupplyDailyResults(
      [],
      [planRow({ supplyAfter: 100 })],
      [],
      [],
      [],
      masterData(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].filed).toBe(false);
    expect(results[0].filedOnTime).toBe(false);
  });

  it('marks filedOnTime only when the whole upload happened on the same day as the latest date it contains', () => {
    const onTime = computeSupplyDailyResults(
      [supplyRow({ productionDate: '2026-08-27' })],
      [],
      [],
      [],
      [],
      masterData(),
      { supplyUploadedAt: '2026-08-27T18:00:00Z' },
    );
    expect(onTime[0].filedOnTime).toBe(true);

    const late = computeSupplyDailyResults(
      [supplyRow({ productionDate: '2026-08-27' })],
      [],
      [],
      [],
      [],
      masterData(),
      { supplyUploadedAt: '2026-08-29T09:00:00Z' },
    );
    expect(late[0].filedOnTime).toBe(false);
  });

  it('reproduces "check ลงราคา": no supply left + tomorrow priced down by >=1 baht + already off-plan', () => {
    const pricing: PricingRow[] = [
      { priceDate: '2026-08-27', vendorGroup: 'SOT_ไก่_1', productGroup: 'BBไก่', costZ: 15, margin: 5, netPrice: 20 },
      { priceDate: '2026-08-28', vendorGroup: 'SOT_ไก่_1', productGroup: 'BBไก่', costZ: 13, margin: 5, netPrice: 18 },
    ];
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 0 })],
      [planRow({ supplyAfter: 0 })],
      [actualRow({ weightKg: 500 })], // pushes it off-plan (0-0 > 0+100)
      pricing,
      [],
      masterData(),
    );
    expect(results[0].isOffPlan).toBe(true);
    expect(results[0].isPricedDownOffPlan).toBe(true);
  });

  it('does not flag check ลงราคา when supply still remains, per IF(F>0,0,...)', () => {
    const pricing: PricingRow[] = [
      { priceDate: '2026-08-27', vendorGroup: 'SOT_ไก่_1', productGroup: 'BBไก่', costZ: 15, margin: 5, netPrice: 20 },
      { priceDate: '2026-08-28', vendorGroup: 'SOT_ไก่_1', productGroup: 'BBไก่', costZ: 10, margin: 5, netPrice: 15 },
    ];
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 1000 })],
      [planRow({ supplyAfter: 0 })],
      [],
      pricing,
      [],
      masterData(),
    );
    expect(results[0].isPricedDownOffPlan).toBe(false);
  });

  it('reproduces "check bid ต่ำ": no supply left + a Bidding record with Allocate sp type = PICKUP_LOW_BIDDING', () => {
    const bidding: BiddingRow[] = [
      { salesDate: '2026-08-27', plantCode: 'OPRCDS111', productGroup: 'BBไก่', allocateSpType: 'PICKUP_LOW_BIDDING', isLowBid: true },
    ];
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 0 })],
      [],
      [],
      [],
      bidding,
      masterData(),
    );
    expect(results[0].isLowBidOffPlan).toBe(true);
  });

  it('does not flag check bid ต่ำ when supply still remains, per IF(F>0,0,...)', () => {
    const bidding: BiddingRow[] = [
      { salesDate: '2026-08-27', plantCode: 'OPRCDS111', productGroup: 'BBไก่', allocateSpType: 'PICKUP_LOW_BIDDING', isLowBid: true },
    ];
    const results = computeSupplyDailyResults(
      [supplyRow({ remainingQty: 1000 })],
      [],
      [],
      [],
      bidding,
      masterData(),
    );
    expect(results[0].isLowBidOffPlan).toBe(false);
  });
});
