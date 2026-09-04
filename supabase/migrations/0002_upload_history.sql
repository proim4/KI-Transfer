-- Upload history: one row per upload *attempt* (not per slot, unlike `uploads`
-- which only ever holds the current file for each (week, file_type)). Lets the
-- Upload page show a full audit trail with version numbers and support
-- deleting a past upload independently of the current one.

create table upload_history (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  file_type text not null check (file_type in ('actual_abs0000', 'plan_weekly_bsr030', 'plan_daily_bdr130')),
  version int not null,
  original_filename text not null,
  file_size bigint,
  storage_path text,
  row_count int not null default 0,
  skipped_count int not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'validated', 'error')),
  error_report jsonb,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index upload_history_week_type_idx on upload_history (week_id, file_type, created_at desc);

alter table upload_history enable row level security;

create policy upload_history_all on upload_history
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on upload_history to anon, authenticated;
