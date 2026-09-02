// Row shapes as returned by supabase-js, matching supabase/migrations/0001_init.sql exactly.

export interface AppSettingsRow {
  id: true;
  require_login: boolean;
  updated_at: string;
}

export interface WeekRow {
  id: string;
  year_no: number;
  week_no: number;
  label: string;
  created_at: string;
  updated_at: string;
}

export type UploadFileType = 'actual_abs0000' | 'plan_weekly_bsr030' | 'plan_daily_bdr130';
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
