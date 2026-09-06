// Row shapes as returned by supabase-js, matching supabase/migrations/0001_init.sql exactly.

export type StatusColor = 'green' | 'amber' | 'red' | 'navy' | 'blue' | 'gray';

export interface AppSettingsRow {
  id: true;
  require_login: boolean;
  status_high_pct: number;
  status_low_pct: number;
  status_high_color: StatusColor;
  status_mid_color: StatusColor;
  status_low_color: StatusColor;
  status_zero_color: StatusColor;
  updated_at: string;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface ProfileRow {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export type ProductLine = 'chicken' | 'pork';

export interface WeekRow {
  id: string;
  year_no: number;
  week_no: number;
  label: string;
  product_line: ProductLine;
  created_at: string;
  updated_at: string;
}

export type UploadFileType =
  | 'actual_abs0000'
  | 'plan_weekly_bsr030'
  | 'plan_daily_bdr130'
  | 'supply_daily_bsd010'
  | 'pricing_daily'
  | 'bidding_tc05';
export type UploadStatus = 'uploaded' | 'validating' | 'validated' | 'error';

export interface UploadErrorEntry {
  rowNumber: number;
  reason: string;
}

export interface UploadRow {
  id: string;
  week_id: string;
  file_type: UploadFileType;
  storage_path: string | null;
  original_filename: string;
  row_count: number;
  skipped_count: number;
  status: UploadStatus;
  error_report: UploadErrorEntry[] | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadHistoryRow {
  id: string;
  week_id: string;
  file_type: UploadFileType;
  version: number;
  original_filename: string;
  file_size: number | null;
  storage_path: string | null;
  row_count: number;
  skipped_count: number;
  status: UploadStatus;
  error_report: UploadErrorEntry[] | null;
  created_at: string;
}

export interface TrackingResultRow {
  id: number;
  week_id: string;
  production_date: string;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
  product_group: string;
  origin_price: number;
  dest_price: number;

  plan_weekly: number;
  plan_daily: number;
  plan_total: number;
  actual_total: number;

  weekly_capped: number;
  weekly_tolerance_adj: number;
  weekly_diff: number;
  weekly_pct: number | null;

  daily_capped: number;
  daily_tolerance_adj: number;
  daily_diff: number;
  daily_pct: number | null;

  total_capped: number;
  total_tolerance_adj: number;
  total_diff: number;
  total_pct: number | null;

  overage: number;
  profit_realized: number;
  profit_lost: number;

  suggest_weekly: number;
  suggest_daily: number;
  suggest_total: number;
  reject_weekly: number;
  reject_daily: number;
  reject_total: number;
  reject_pct: number | null;
  remark: string | null;

  created_at: string;
}

export interface UnmatchedActualRow {
  id: number;
  week_id: string;
  transfer_date: string;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
  product_group: string;
  total_weight_kg: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Supply Daily filing tracker ("ติดตามการกรอก Supply Daily")
// ---------------------------------------------------------------------------

/** File-type discriminator for sources that support multiple files per week (one upload_files row per file — see migrations 0012/0013). */
export type MultiFileUploadType = 'supply_daily_bsd010' | 'pricing_daily' | 'bidding_tc05' | 'plan_daily_bdr130';

export interface UploadFileRow {
  id: string;
  week_id: string;
  file_type: MultiFileUploadType;
  original_filename: string;
  file_size: number | null;
  storage_path: string | null;
  status: UploadStatus;
  row_count: number;
  skipped_count: number;
  error_report: UploadErrorEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface SupplyDailyRawRow {
  id: number;
  week_id: string;
  upload_file_id: string | null;
  production_date: string;
  origin_code: string;
  origin_name: string;
  product_group: string;
  product_group_custom: string;
  remaining_qty: number;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface PricingRawRow {
  id: number;
  week_id: string;
  upload_file_id: string | null;
  price_date: string;
  vendor_group: string;
  product_group: string;
  cost_z: number;
  margin: number;
  net_price: number;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface BiddingRawRow {
  id: number;
  week_id: string;
  upload_file_id: string | null;
  sales_date: string;
  plant_code: string;
  product_group: string;
  allocate_sp_type: string;
  is_low_bid: boolean;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface SupplyDailyResultRow {
  id: number;
  week_id: string;
  production_date: string;
  origin_code: string;
  origin_name: string;
  product_group: string;

  filed: boolean;

  remaining_qty: number;
  plan_out: number;
  remaining_after_plan: number;
  actual_out: number;

  is_off_plan: boolean;
  is_off_plan_off_zone: number;
  is_priced_down_off_plan: boolean;
  is_low_bid_off_plan: boolean;

  /** Raw (ungated) version of is_priced_down_off_plan — a price cut happened regardless of supply/off-plan status. */
  is_priced_down: boolean;
  /** Raw (ungated) version of is_low_bid_off_plan — a low-bid record exists regardless of supply status. */
  is_low_bid: boolean;
  /** Data-quality: origin factory has no entry in mas_factory_zones (zone/off-zone checks could not run for this key). */
  origin_zone_unresolved: boolean;
  /** Data-quality: origin factory has no entry in mas_factories (the ลงราคา check could not run for this key). */
  vendor_group_unresolved: boolean;

  created_at: string;
}

export interface MasFactoryRow {
  id: number;
  plant_code: string;
  warehouse_name: string;
  class_price: string | null;
  vendor_group: string | null;
  class_price_ladder: string | null;
  species: string | null;
}

export interface MasFactoryZoneRow {
  plant_code: string;
  warehouse_name: string;
  zone: string;
}

export interface MasTollProcessingPairRow {
  id: number;
  origin_name: string;
  dest_name: string;
}

export interface MasSpecialSkuRow {
  sku_name: string;
}

export interface MasProductRow {
  product_code: string;
  product_name: string;
  plan1: string | null;
  plan7: string | null;
  plan19: string | null;
  plan19_custom: string | null;
}

export interface MasSkuRepresentativeRow {
  product_code: string;
  product_name: string;
  plan1: string;
  plan19: string;
  p19_custom: string;
  in_program: string;
}
