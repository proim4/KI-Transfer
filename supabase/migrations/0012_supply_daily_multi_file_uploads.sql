-- The 3 new Supply Daily data sources (BSD010, daily pricing, TC05 Bidding)
-- routinely come as several files per week (one per day) that all need to
-- coexist and combine, unlike ABS0000/BSR030/BDR130 which stay single-file
-- (the existing `uploads` table's unique(week_id, file_type) is exactly
-- "one current file per slot" and must keep working unchanged for those).
-- upload_files is a separate, parallel table for these 3 types only: many
-- rows per (week_id, file_type), one per currently-active file. Re-uploading
-- a file with the same name replaces just that file (delete-then-reinsert,
-- enforced by the app layer, not a DB trigger) rather than the whole
-- category, so other files already in that category are untouched.
create table upload_files (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  file_type text not null check (file_type in ('supply_daily_bsd010', 'pricing_daily', 'bidding_tc05')),
  original_filename text not null,
  file_size bigint,
  storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'validated', 'error')),
  row_count int not null default 0,
  skipped_count int not null default 0,
  error_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, file_type, original_filename)
);

create index upload_files_week_type_idx on upload_files (week_id, file_type);

alter table upload_files enable row level security;

create policy upload_files_all on upload_files
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on upload_files to anon, authenticated;

-- Tags each data row with the file it came from, so deleting one
-- upload_files row (on replace or manual delete) cascades to remove only
-- that file's rows -- other files in the same category are unaffected.
alter table supply_daily_rows add column upload_file_id uuid references upload_files (id) on delete cascade;
alter table pricing_rows add column upload_file_id uuid references upload_files (id) on delete cascade;
alter table bidding_rows add column upload_file_id uuid references upload_files (id) on delete cascade;

create index supply_daily_rows_upload_file_idx on supply_daily_rows (upload_file_id);
create index pricing_rows_upload_file_idx on pricing_rows (upload_file_id);
create index bidding_rows_upload_file_idx on bidding_rows (upload_file_id);
