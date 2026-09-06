export type SourceFile = 'weekly' | 'daily';

/** A single row from the plan input (BSR030 weekly export or BDR130 daily export). */
export interface PlanRow {
  sourceFile: SourceFile;
  productionDate: string; // ISO 'YYYY-MM-DD'
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  /** productForPlan19 — the product-group label the upstream system already assigned. */
  productGroup: string;
  originPrice: number;
  destPrice: number;
  /** The system's originally recommended transfer amount, before manual adjustment. */
  suggest: number;
  /** The finalized/adjusted plan amount — this is what the tracking sheet treats as "the plan". */
  supplyAfter: number;
}

/** A single row from the actual-transfer input (ABS0000 export). */
export interface ActualRow {
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  transferDate: string; // ISO 'YYYY-MM-DD'
  skuCode: string;
  skuName: string;
  weightKg: number;
  /** P19 — the product-group label the upstream system already assigned. */
  productGroup: string;
}

export type Channel = 'weekly' | 'daily' | 'total';

export interface ChannelResult {
  /** MIN(actual, plan) */
  capped: number;
  /** capped, rounded up to the full plan if the shortfall is under the 10% tolerance. */
  toleranceAdj: number;
  /** toleranceAdj - plan (<= 0) */
  diff: number;
  /** toleranceAdj / plan, or null when plan is 0 (displayed as "-"). */
  pct: number | null;
}

/**
 * One computed row of the tracking sheet, keyed by
 * (productionDate, originCode, destCode, productGroup).
 */
export interface TrackingResult {
  productionDate: string;
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  productGroup: string;
  originPrice: number;
  destPrice: number;

  planWeekly: number;
  planDaily: number;
  planTotal: number;
  actualTotal: number;

  weekly: ChannelResult;
  daily: ChannelResult;
  total: ChannelResult;

  /** Actual beyond the total plan (not credited as "on-plan"). */
  overage: number;
  /** (destPrice - originPrice) * actualTotal — raw, uncapped. */
  profitRealized: number;
  /** -MAX(0, planTotal - actualTotal) * MAX(0, destPrice - originPrice) — raw, no 10% tolerance grace. */
  profitLost: number;

  suggestWeekly: number;
  suggestDaily: number;
  suggestTotal: number;
  /** MAX(suggest - supplyAfter, 0) per channel — the portion of the system's suggestion that was rejected/cut during plan finalization. */
  rejectWeekly: number;
  rejectDaily: number;
  rejectTotal: number;
  /** rejectTotal / suggestTotal, or null when suggestTotal is 0. */
  rejectPct: number | null;
}

/**
 * Actual-transfer volume whose (date, origin, dest, productGroup) key matches
 * no plan row at all this week — i.e. transfers of a route/product the plan
 * never recommended.
 */
export interface UnmatchedActual {
  key: string;
  transferDate: string;
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  productGroup: string;
  totalWeightKg: number;
  rows: ActualRow[];
}

// ---------------------------------------------------------------------------
// Supply Daily filing tracker ("ติดตามการกรอก Supply Daily") — see
// supplyDailyCalcEngine.ts for the check formulas, reverse-engineered from
// Tracking_การกรอก Supply Daily_WK35.xlsx.
// ---------------------------------------------------------------------------

/** A single row from the BSD010 "Actual Balance Supply Daily" export. */
export interface SupplyDailyRow {
  productionDate: string; // ISO 'YYYY-MM-DD'
  originCode: string;
  originName: string;
  /** กลุ่มชิ้นส่วน / P19 */
  productGroup: string;
  productGroupCustom: string;
  /** BSD010 "Rev. ปริมาณของเหลือ" — remaining supply after every adjustment. */
  remainingQty: number;
}

/** A single row from the daily pricing export (date is parsed from the filename, not a column). */
export interface PricingRow {
  priceDate: string; // ISO 'YYYY-MM-DD'
  vendorGroup: string;
  /** Resolved via ProductCode -> mas_sku_representative.plan19. */
  productGroup: string;
  costZ: number;
  margin: number;
  /** costZ + margin — the file has no literal "Net Price" column (see plan notes: this one formula is inferred, not read directly). */
  netPrice: number;
}

/** A single row from the TC05 "Actual allocation" (Bidding) export. */
export interface BiddingRow {
  salesDate: string; // ISO 'YYYY-MM-DD'
  plantCode: string;
  /** Resolved via Product code -> mas_products.plan19. */
  productGroup: string;
  allocateSpType: string;
  /** allocateSpType === 'PICKUP_LOW_BIDDING' */
  isLowBid: boolean;
}

/** Static reference data seeded once from the workbook's Mas sheets (see migration 0011). */
export interface SupplyDailyMasterData {
  /** SKU *names* flagged as "SKU พิเศษ" (matched by name, not code — mirrors the Excel's own VLOOKUP). */
  specialSkuNames: Set<string>;
  /** Registered "ฝากตัดแต่ง" (toll-processing) pairs, keyed `${originName}::${destName}` (matched by factory name). */
  tollProcessingPairs: Set<string>;
  /** plant_code -> zone (ภาค). Deliberately partial — some factories have no zone mapping in the source workbook, same as Excel. */
  factoryZoneByCode: Map<string, string>;
  /** plant_code -> vendor_group, first-match-wins (mirrors XLOOKUP against a table with multiple rows per factory). */
  vendorGroupByFactoryCode: Map<string, string>;
}

/**
 * One computed row of the Supply Daily tracking sheet, keyed by
 * (productionDate, originCode, productGroup) — BSD010 carries no destination
 * dimension, so this is coarser than TrackingResult's key.
 */
export interface SupplyDailyResult {
  productionDate: string;
  originCode: string;
  originName: string;
  productGroup: string;

  /** A supply_daily_rows entry exists for this exact key. */
  filed: boolean;
  /** Only meaningful when filed; see supplyDailyCalcEngine's on-time rule. */
  filedOnTime: boolean;

  remainingQty: number;
  /** Sum of plan_rows.supplyAfter across every destination for this (date, origin, group). */
  planOut: number;
  remainingAfterPlan: number;
  /** Sum of actual_rows.weightKg for this key, excluding special-SKU/toll-processing/zone-unresolved rows. */
  actualOut: number;

  /** actualOut - planOut > remainingAfterPlan + 100kg (and remainingQty >= 0). */
  isOffPlan: boolean;
  /** Count of individual actual-transfer rows that are off-plan AND cross a zone boundary. */
  isOffPlanOffZone: number;
  /** No supply left, a price cut is scheduled for tomorrow, and this key is off-plan. */
  isPricedDownOffPlan: boolean;
  /** No supply left and a Bidding record this key has Allocate sp type = PICKUP_LOW_BIDDING. */
  isLowBidOffPlan: boolean;

  /** A price cut of >=1 baht is scheduled for tomorrow for this key's vendor group/product group — the same price comparison as isPricedDownOffPlan, but WITHOUT the "no supply left" / "already off-plan" gates. Used for dashboard totals ("จำนวนรายการลงราคา"), not an exception flag on its own. */
  isPricedDown: boolean;
  /** A Bidding record this key has Allocate sp type = PICKUP_LOW_BIDDING — same as isLowBidOffPlan but WITHOUT the "no supply left" gate. Used for dashboard totals ("จำนวนรายการ Bidding"). */
  isLowBid: boolean;

  /** Data-quality: this key's origin factory has no entry in mas_factory_zones, so off-plan-off-zone / actual-out filtering could not be evaluated for it (silently excluded rather than a genuine "in zone"/"resolved" result). */
  originZoneUnresolved: boolean;
  /** Data-quality: this key's origin factory has no entry in mas_factories (vendor_group), so the "check ลงราคา" comparison could not run at all (isPricedDown/isPricedDownOffPlan are both false by default, not a genuine "no price cut"). */
  vendorGroupUnresolved: boolean;
}
