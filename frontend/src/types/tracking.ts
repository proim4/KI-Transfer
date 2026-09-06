// Input row shapes produced by the Excel parser before they're inserted into
// plan_rows / actual_rows. Kept in sync by hand with
// supabase/functions/_shared/types.ts (PlanRow / ActualRow) — the frontend
// can't import across the Supabase Edge Function's own TS project, so this is
// a deliberate, small duplication rather than a shared package.

export type SourceFile = 'weekly' | 'daily';

export interface PlanRow {
  sourceFile: SourceFile;
  productionDate: string; // ISO 'YYYY-MM-DD'
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  productGroup: string;
  originPrice: number;
  destPrice: number;
  suggest: number;
  supplyAfter: number;
  /** The full original Excel row (every column, keyed by its source header), stored verbatim so ข้อมูลดิบ can show columns beyond the ones this app parses. */
  raw: Record<string, unknown>;
}

export interface ActualRow {
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  transferDate: string; // ISO 'YYYY-MM-DD'
  skuCode: string;
  skuName: string;
  weightKg: number;
  productGroup: string;
  /** The full original Excel row (every column, keyed by its source header), stored verbatim so ข้อมูลดิบ can show columns beyond the ones this app parses. */
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Supply Daily filing tracker inputs — kept in sync by hand with
// supabase/functions/_shared/types.ts (SupplyDailyRow / PricingRow /
// BiddingRow), same reason as above.
// ---------------------------------------------------------------------------

/** A single row from the BSD010 "Actual Balance Supply Daily" export. */
export interface SupplyDailyRow {
  productionDate: string; // ISO 'YYYY-MM-DD'
  originCode: string;
  originName: string;
  productGroup: string;
  productGroupCustom: string;
  /** BSD010 "Rev. ปริมาณของเหลือ" */
  remainingQty: number;
  raw: Record<string, unknown>;
}

/** A single row from the daily pricing export — priceDate comes from the filename, not a column. */
export interface PricingRow {
  priceDate: string; // ISO 'YYYY-MM-DD'
  vendorGroup: string;
  /** Resolved from ProductCode via mas_sku_representative.plan19. */
  productGroup: string;
  costZ: number;
  margin: number;
  /** costZ + margin — the file has no literal "Net Price" column. */
  netPrice: number;
  raw: Record<string, unknown>;
}

/** A single row from the TC05 "Actual allocation" (Bidding) export. */
export interface BiddingRow {
  salesDate: string; // ISO 'YYYY-MM-DD'
  plantCode: string;
  /** Resolved from Product code via mas_products.plan19. */
  productGroup: string;
  allocateSpType: string;
  /** allocateSpType === 'PICKUP_LOW_BIDDING' */
  isLowBid: boolean;
  raw: Record<string, unknown>;
}
