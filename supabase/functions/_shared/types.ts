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
