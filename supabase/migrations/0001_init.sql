-- Transfer-vs-plan tracking: core schema.
-- Public/anon and authenticated roles get the same table access; whether a
-- login is actually required is enforced in the frontend route guard based on
-- app_settings.require_login, not by RLS (see plan doc for rationale).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- app_settings: single-row runtime config, toggled from the Settings page.
-- ---------------------------------------------------------------------------
create table app_settings (
  id boolean primary key default true check (id), -- enforces exactly one row
  require_login boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into app_settings (id, require_login) values (true, true);

alter table app_settings enable row level security;

create policy app_settings_select on app_settings
  for select to anon, authenticated using (true);

create policy app_settings_update on app_settings
  for update to anon, authenticated using (true) with check (true);

grant select, update on app_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- weeks: one row per (year, ISO week) dataset generation.
-- ---------------------------------------------------------------------------
create table weeks (
  id uuid primary key default gen_random_uuid(),
  year_no int not null,
  week_no int not null,
  label text not null, -- e.g. "WK36"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year_no, week_no)
);

alter table weeks enable row level security;

create policy weeks_all on weeks
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on weeks to anon, authenticated;

-- ---------------------------------------------------------------------------
-- uploads: one row per (week, file_type). Re-uploading replaces this row and
-- its underlying plan_rows/actual_rows rather than appending — this is the
-- direct fix for the Power Query "Folder.Files" double-count risk found in
-- the original workbook (any file left in a week's folder gets unioned in).
-- ---------------------------------------------------------------------------
create table uploads (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  file_type text not null check (file_type in ('actual_abs0000', 'plan_weekly_bsr030', 'plan_daily_bdr130')),
  storage_path text,
  original_filename text not null,
  row_count int not null default 0,
  skipped_count int not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'validated', 'error')),
  error_report jsonb,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, file_type)
);

alter table uploads enable row level security;

create policy uploads_all on uploads
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on uploads to anon, authenticated;

-- ---------------------------------------------------------------------------
-- plan_rows: normalized rows from BSR030 (weekly) / BDR130 (daily) exports.
-- ---------------------------------------------------------------------------
create table plan_rows (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  source_file text not null check (source_file in ('weekly', 'daily')),
  production_date date not null,
  origin_code text not null,
  origin_name text not null,
  dest_code text not null,
  dest_name text not null,
  product_group text not null, -- productForPlan19
  origin_price numeric not null default 0,
  dest_price numeric not null default 0,
  suggest numeric not null default 0,
  supply_after numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index plan_rows_week_key_idx
  on plan_rows (week_id, production_date, origin_code, dest_code, product_group);

alter table plan_rows enable row level security;

create policy plan_rows_all on plan_rows
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on plan_rows to anon, authenticated;

-- ---------------------------------------------------------------------------
-- actual_rows: normalized rows from the ABS0000 export.
-- ---------------------------------------------------------------------------
create table actual_rows (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  origin_code text not null,
  origin_name text not null,
  dest_code text not null,
  dest_name text not null,
  transfer_date date not null,
  sku_code text not null,
  sku_name text not null,
  weight_kg numeric not null default 0,
  product_group text not null, -- P19
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index actual_rows_week_key_idx
  on actual_rows (week_id, transfer_date, origin_code, dest_code, product_group);

alter table actual_rows enable row level security;

create policy actual_rows_all on actual_rows
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on actual_rows to anon, authenticated;

-- ---------------------------------------------------------------------------
-- tracking_results: the computed output of the process-week Edge Function.
-- One row per (week, production_date, origin, dest, product_group). Feeds the
-- Summary dashboard, drill-down table, history, and Excel export directly.
-- ---------------------------------------------------------------------------
create table tracking_results (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  production_date date not null,
  origin_code text not null,
  origin_name text not null,
  dest_code text not null,
  dest_name text not null,
  product_group text not null,
  origin_price numeric not null default 0,
  dest_price numeric not null default 0,

  plan_weekly numeric not null default 0,
  plan_daily numeric not null default 0,
  plan_total numeric not null default 0,
  actual_total numeric not null default 0,

  weekly_capped numeric not null default 0,
  weekly_tolerance_adj numeric not null default 0,
  weekly_diff numeric not null default 0,
  weekly_pct numeric,

  daily_capped numeric not null default 0,
  daily_tolerance_adj numeric not null default 0,
  daily_diff numeric not null default 0,
  daily_pct numeric,

  total_capped numeric not null default 0,
  total_tolerance_adj numeric not null default 0,
  total_diff numeric not null default 0,
  total_pct numeric,

  overage numeric not null default 0,
  profit_realized numeric not null default 0,
  profit_lost numeric not null default 0,

  suggest_weekly numeric not null default 0,
  suggest_daily numeric not null default 0,
  suggest_total numeric not null default 0,
  reject_weekly numeric not null default 0,
  reject_daily numeric not null default 0,
  reject_total numeric not null default 0,
  reject_pct numeric,

  created_at timestamptz not null default now()
);

create index tracking_results_week_idx on tracking_results (week_id);
create index tracking_results_week_date_idx on tracking_results (week_id, production_date);
create index tracking_results_week_dest_idx on tracking_results (week_id, dest_code);

alter table tracking_results enable row level security;

create policy tracking_results_all on tracking_results
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on tracking_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- unmatched_actual: actual-transfer volume with no matching plan row at all
-- (a route/product-group the plan never recommended this week).
-- ---------------------------------------------------------------------------
create table unmatched_actual (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  transfer_date date not null,
  origin_code text not null,
  origin_name text not null,
  dest_code text not null,
  dest_name text not null,
  product_group text not null,
  total_weight_kg numeric not null default 0,
  created_at timestamptz not null default now()
);

create index unmatched_actual_week_idx on unmatched_actual (week_id);

alter table unmatched_actual enable row level security;

create policy unmatched_actual_all on unmatched_actual
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on unmatched_actual to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for the raw uploaded files (audit trail / re-download).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('transfer-uploads', 'transfer-uploads', false)
on conflict (id) do nothing;

create policy transfer_uploads_all on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'transfer-uploads')
  with check (bucket_id = 'transfer-uploads');
