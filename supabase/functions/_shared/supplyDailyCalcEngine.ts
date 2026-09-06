import type {
  ActualRow,
  BiddingRow,
  PlanRow,
  PricingRow,
  SupplyDailyMasterData,
  SupplyDailyResult,
  SupplyDailyRow,
} from './types.ts';

/**
 * Exact constant from the workbook's "check โอนนอกแผน" formula:
 *   =IF(F4<0,0,IF(I4-G4>H4+100,1,0))
 * (actual - plan) has to clear the remaining-after-plan figure by more than
 * 100kg before it's flagged — not a tuned threshold, the literal Excel value.
 */
const OFF_PLAN_TOLERANCE_KG = 100;

/**
 * Exact constant from "check ลงราคา": =IF(H2-I2>=1,1,0) — today's average net
 * price has to exceed tomorrow's by at least 1 baht to count as a scheduled
 * price cut.
 */
const PRICE_CUT_THRESHOLD_BAHT = 1;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function keyOf(date: string, origin: string, productGroup: string): string {
  return `${date}|${origin}|${productGroup}`;
}

function tollPairKey(originName: string, destName: string): string {
  return `${originName}::${destName}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "Sum of แผนโอนออก" — sums plan_rows.supplyAfter across every destination
 * (and both weekly/daily source files) for each (productionDate, originCode,
 * productGroup). This is a coarser re-aggregation of the exact same
 * plan_rows the existing "ติดตามแผนโอน" tab already populates — BSD010 (and
 * therefore this whole tracking sheet) has no destination-factory dimension.
 */
export function aggregatePlanOut(planRows: PlanRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of planRows) {
    const key = keyOf(row.productionDate, row.originCode, row.productGroup);
    out.set(key, (out.get(key) ?? 0) + row.supplyAfter);
  }
  return out;
}

/**
 * Whether an actual-transfer row counts toward Supply Daily's own "actual
 * out" figure at all — mirrors the workbook's ข้อมูล!I SUMIFS filter
 * (Check Sku พิเศษ=FALSE, Check ฝากตัดแต่ง=FALSE, Check โรงต้นทาง=TRUE,
 * Check โรงปลายทาง=TRUE): not a special SKU, not a registered
 * toll-processing pair, and both the origin and destination factory must
 * resolve to a known zone.
 */
function actualRowCounts(row: ActualRow, masterData: SupplyDailyMasterData): boolean {
  if (masterData.specialSkuNames.has(row.skuName)) return false;
  if (masterData.tollProcessingPairs.has(tollPairKey(row.originName, row.destName))) return false;
  if (!masterData.factoryZoneByCode.has(row.originCode)) return false;
  if (!masterData.factoryZoneByCode.has(row.destCode)) return false;
  return true;
}

/**
 * "ปริมาณโอนออกจริง" — sums actual_rows.weightKg for each (transferDate,
 * originCode, productGroup), applying the same exclusion filter as
 * actualRowCounts. This is a filtered *view* over the existing actual_rows
 * table (extra WHERE conditions), not a duplicate of any existing data.
 */
export function aggregateActualOut(actualRows: ActualRow[], masterData: SupplyDailyMasterData): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of actualRows) {
    if (!actualRowCounts(row, masterData)) continue;
    const key = keyOf(row.transferDate, row.originCode, row.productGroup);
    out.set(key, (out.get(key) ?? 0) + row.weightKg);
  }
  return out;
}

/**
 * "check โอนนอกแผนนอกโซน" per key — counts individual actual-transfer rows
 * that (a) pass the same exclusion filter as aggregateActualOut, (b) belong
 * to a key already flagged off-plan, and (c) cross a zone boundary
 * (origin zone != dest zone, both resolved). Mirrors โอนจริง!W:
 *   =IF(ภาคต้นทาง=ภาคปลายทาง,0,IF(โอนนอกแผน=0,0,1))
 */
export function countOffPlanOffZoneRows(
  actualRows: ActualRow[],
  masterData: SupplyDailyMasterData,
  offPlanKeys: Set<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of actualRows) {
    if (!actualRowCounts(row, masterData)) continue;
    const key = keyOf(row.transferDate, row.originCode, row.productGroup);
    if (!offPlanKeys.has(key)) continue;
    const originZone = masterData.factoryZoneByCode.get(row.originCode);
    const destZone = masterData.factoryZoneByCode.get(row.destCode);
    if (originZone === destZone) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Average net price per (vendorGroup, productGroup, priceDate) — matches the
 * "ราคารายวัน" pivot's "Average of Net Price" data field.
 */
function averageNetPriceByKey(pricingRows: PricingRow[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const row of pricingRows) {
    const key = `${row.vendorGroup}|${row.productGroup}|${row.priceDate}`;
    const entry = sums.get(key) ?? { total: 0, count: 0 };
    entry.total += row.netPrice;
    entry.count += 1;
    sums.set(key, entry);
  }
  const out = new Map<string, number>();
  for (const [key, { total, count }] of sums) {
    out.set(key, count > 0 ? total / count : 0);
  }
  return out;
}

/**
 * "check ลงราคา" per key — true when supply is exhausted (remainingQty <= 0),
 * a price cut of at least 1 baht is scheduled effective tomorrow for this
 * factory's vendor group/product group, and the key is already off-plan.
 * Mirrors ข้อมูล!L:
 *   =IF(IF(F>0,0,SUMIFS(ลงราคา!check,...))=0,0,IF(check_off_plan>0,1,0))
 */
function computePricedDownOffPlan(
  originCode: string,
  productGroup: string,
  date: string,
  remainingQty: number,
  isOffPlan: boolean,
  avgNetPriceByKey: Map<string, number>,
  masterData: SupplyDailyMasterData,
): boolean {
  if (remainingQty > 0) return false;
  const vendorGroup = masterData.vendorGroupByFactoryCode.get(originCode);
  if (!vendorGroup) return false;
  const todayKey = `${vendorGroup}|${productGroup}|${date}`;
  const tomorrowKey = `${vendorGroup}|${productGroup}|${addDaysIso(date, 1)}`;
  const todayPrice = avgNetPriceByKey.get(todayKey);
  const tomorrowPrice = avgNetPriceByKey.get(tomorrowKey);
  if (todayPrice === undefined || tomorrowPrice === undefined) return false;
  const pricedDown = todayPrice - tomorrowPrice >= PRICE_CUT_THRESHOLD_BAHT;
  return pricedDown && isOffPlan;
}

/**
 * "check bid ต่ำ" per key — true when supply is exhausted and a Bidding
 * record this date/factory/group has Allocate sp type = PICKUP_LOW_BIDDING.
 * Mirrors ข้อมูล!M:
 *   =IF(F>0,0,MIN(1,SUMIFS('bid ต่ำ'!bid,...)))
 */
function aggregateLowBidFlags(biddingRows: BiddingRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of biddingRows) {
    if (!row.isLowBid) continue;
    out.add(keyOf(row.salesDate, row.plantCode, row.productGroup));
  }
  return out;
}

export interface ComputeSupplyDailyOptions {
  /**
   * ISO datetime the current supply_daily_rows upload was ingested at (e.g.
   * `uploads.updated_at`). Used only for the on-time-filing rule below — this
   * is a new operational rule, not read from the Excel (BSD010 carries no
   * per-row timestamp at all). A single upload covers many days at once (the
   * whole week's combined BSD010 file, same "Folder.Files" pattern as
   * BDR130/ABS0000), so "on time" is judged per *upload*, not per row: was
   * this upload made on the same calendar day as the most recent date it
   * actually contains? Every row from that same upload shares that verdict.
   */
  supplyUploadedAt?: string;
}

/**
 * Computes one SupplyDailyResult per (productionDate, originCode,
 * productGroup) key seen anywhere across supplyRows/planRows/actualRows —
 * including keys with a plan or actual but no filed supply row at all, so
 * "supply never filed but a transfer still happened" (case B/D) is visible,
 * not silently dropped the way the source workbook's own pivot (which is
 * driven only by BSD010 rows) would.
 *
 * On-time filing rule (per product decision, not in the Excel): a key is
 * "filed on time" only if it was actually filed AND the whole
 * supply_daily_rows upload happened on the SAME calendar date as this row's
 * own production_date — an upload dated any later day counts as late.
 */
export function computeSupplyDailyResults(
  supplyRows: SupplyDailyRow[],
  planRows: PlanRow[],
  actualRows: ActualRow[],
  pricingRows: PricingRow[],
  biddingRows: BiddingRow[],
  masterData: SupplyDailyMasterData,
  options: ComputeSupplyDailyOptions = {},
): SupplyDailyResult[] {
  const planOutByKey = aggregatePlanOut(planRows);
  const actualOutByKey = aggregateActualOut(actualRows, masterData);
  const avgNetPriceByKey = averageNetPriceByKey(pricingRows);
  const lowBidKeys = aggregateLowBidFlags(biddingRows);

  // "On time" is judged for the whole upload at once (see ComputeSupplyDailyOptions):
  // was it made on the same calendar day as the most recent date it contains?
  const latestFiledDate = supplyRows.reduce<string | null>(
    (max, row) => (max === null || row.productionDate > max ? row.productionDate : max),
    null,
  );
  const uploadWasOnTime =
    options.supplyUploadedAt !== undefined && latestFiledDate !== null
      ? options.supplyUploadedAt.slice(0, 10) === latestFiledDate
      : false;

  interface RowInfo {
    productionDate: string;
    originCode: string;
    originName: string;
    productGroup: string;
    remainingQty: number;
    filed: boolean;
  }
  const rows = new Map<string, RowInfo>();
  for (const row of supplyRows) {
    const key = keyOf(row.productionDate, row.originCode, row.productGroup);
    rows.set(key, {
      productionDate: row.productionDate,
      originCode: row.originCode,
      originName: row.originName,
      productGroup: row.productGroup,
      remainingQty: row.remainingQty,
      filed: true,
    });
  }
  for (const row of planRows) {
    const key = keyOf(row.productionDate, row.originCode, row.productGroup);
    if (!rows.has(key)) {
      rows.set(key, {
        productionDate: row.productionDate,
        originCode: row.originCode,
        originName: row.originName,
        productGroup: row.productGroup,
        remainingQty: 0,
        filed: false,
      });
    }
  }
  for (const row of actualRows) {
    const key = keyOf(row.transferDate, row.originCode, row.productGroup);
    if (!rows.has(key)) {
      rows.set(key, {
        productionDate: row.transferDate,
        originCode: row.originCode,
        originName: row.originName,
        productGroup: row.productGroup,
        remainingQty: 0,
        filed: false,
      });
    }
  }

  // First pass: off-plan flag per key (needed before the off-zone row count,
  // which depends on it — mirrors the Excel's column order J then K).
  const offPlanKeys = new Set<string>();
  for (const [key, info] of rows) {
    const planOut = planOutByKey.get(key) ?? 0;
    const actualOut = actualOutByKey.get(key) ?? 0;
    const remainingAfterPlan = info.remainingQty - planOut;
    const isOffPlan = info.remainingQty >= 0 && actualOut - planOut > remainingAfterPlan + OFF_PLAN_TOLERANCE_KG;
    if (isOffPlan) offPlanKeys.add(key);
  }
  const offZoneCountByKey = countOffPlanOffZoneRows(actualRows, masterData, offPlanKeys);

  const results: SupplyDailyResult[] = [];
  for (const [key, info] of rows) {
    const planOut = planOutByKey.get(key) ?? 0;
    const actualOut = actualOutByKey.get(key) ?? 0;
    const remainingAfterPlan = info.remainingQty - planOut;
    const isOffPlan = offPlanKeys.has(key);
    const filedOnTime = info.filed && uploadWasOnTime;

    results.push({
      productionDate: info.productionDate,
      originCode: info.originCode,
      originName: info.originName,
      productGroup: info.productGroup,
      filed: info.filed,
      filedOnTime,
      remainingQty: info.remainingQty,
      planOut,
      remainingAfterPlan,
      actualOut,
      isOffPlan,
      isOffPlanOffZone: offZoneCountByKey.get(key) ?? 0,
      isPricedDownOffPlan: computePricedDownOffPlan(
        info.originCode,
        info.productGroup,
        info.productionDate,
        info.remainingQty,
        isOffPlan,
        avgNetPriceByKey,
        masterData,
      ),
      isLowBidOffPlan: info.remainingQty <= 0 && lowBidKeys.has(key),
    });
  }

  return results;
}
