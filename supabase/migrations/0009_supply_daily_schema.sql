-- Supply Daily filing tracker: schema for the new "ติดตามการกรอก Supply Daily"
-- tab. Reuses `weeks`/`plan_rows`/`actual_rows` as-is (no duplicate upload) and
-- adds the 3 genuinely-new data sources (BSD010 Supply Daily, daily pricing,
-- TC05 Bidding) plus the computed output table. All new tables scope through
-- week_id (FK cascade) so product_line (chicken/pork, added in 0007) is
-- inherited for free, exactly like plan_rows/actual_rows today.

-- ---------------------------------------------------------------------------
-- supply_daily_rows: normalized rows from the BSD010 "Actual Balance Supply
-- Daily" export. Match key is (production_date, origin_code, product_group) —
-- BSD010 carries no destination-factory dimension.
-- ---------------------------------------------------------------------------
create table supply_daily_rows (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  production_date date not null,
  origin_code text not null,
  origin_name text not null,
  product_group text not null, -- กลุ่มชิ้นส่วน / P19
  product_group_custom text not null default '',
  remaining_qty numeric not null default 0, -- BSD010 "Rev. ปริมาณของเหลือ"
  raw json not null default '{}'::json,
  created_at timestamptz not null default now()
);

create index supply_daily_rows_week_key_idx
  on supply_daily_rows (week_id, production_date, origin_code, product_group);

alter table supply_daily_rows enable row level security;

create policy supply_daily_rows_all on supply_daily_rows
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on supply_daily_rows to anon, authenticated;

-- ---------------------------------------------------------------------------
-- pricing_rows: normalized rows from the daily pricing export
-- (ChickenW2_DD.MM.YYYY.xlsx — the date comes from the filename, the file
-- itself carries no date column). net_price = cost_z + margin, computed at
-- parse time (the file has no literal "Net Price" column — see plan notes).
-- ---------------------------------------------------------------------------
create table pricing_rows (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  price_date date not null,
  vendor_group text not null,
  product_group text not null, -- resolved via SKU -> mas_sku_representative
  cost_z numeric not null default 0,
  margin numeric not null default 0,
  net_price numeric not null default 0,
  raw json not null default '{}'::json,
  created_at timestamptz not null default now()
);

create index pricing_rows_week_key_idx
  on pricing_rows (week_id, price_date, vendor_group, product_group);

alter table pricing_rows enable row level security;

create policy pricing_rows_all on pricing_rows
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on pricing_rows to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bidding_rows: normalized rows from the TC05 "Actual allocation" export.
-- is_low_bid is precomputed at parse time from Allocate sp type, mirroring the
-- source workbook's own "bid" calculated column.
-- ---------------------------------------------------------------------------
create table bidding_rows (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  sales_date date not null,
  plant_code text not null,
  product_group text not null, -- resolved via Product code -> mas_products
  allocate_sp_type text not null default '',
  is_low_bid boolean not null default false, -- allocate_sp_type = 'PICKUP_LOW_BIDDING'
  raw json not null default '{}'::json,
  created_at timestamptz not null default now()
);

create index bidding_rows_week_key_idx
  on bidding_rows (week_id, sales_date, plant_code, product_group);

alter table bidding_rows enable row level security;

create policy bidding_rows_all on bidding_rows
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on bidding_rows to anon, authenticated;

-- ---------------------------------------------------------------------------
-- supply_daily_results: the computed output of the process-supply-daily-week
-- Edge Function. One row per (week_id, production_date, origin_code,
-- product_group). Feeds the new tab's KPIs, detail table, and exception
-- panel directly.
-- ---------------------------------------------------------------------------
create table supply_daily_results (
  id bigint generated always as identity primary key,
  week_id uuid not null references weeks (id) on delete cascade,
  production_date date not null,
  origin_code text not null,
  origin_name text not null,
  product_group text not null,

  filed boolean not null default false,
  filed_on_time boolean not null default false,

  remaining_qty numeric not null default 0,
  plan_out numeric not null default 0,
  remaining_after_plan numeric not null default 0,
  actual_out numeric not null default 0,

  is_off_plan boolean not null default false,
  is_off_plan_off_zone int not null default 0,
  is_priced_down_off_plan boolean not null default false,
  is_low_bid_off_plan boolean not null default false,

  created_at timestamptz not null default now()
);

create index supply_daily_results_week_idx on supply_daily_results (week_id);
create index supply_daily_results_week_date_idx
  on supply_daily_results (week_id, production_date);
create index supply_daily_results_week_origin_idx
  on supply_daily_results (week_id, origin_code);

alter table supply_daily_results enable row level security;

create policy supply_daily_results_all on supply_daily_results
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on supply_daily_results to anon, authenticated;
