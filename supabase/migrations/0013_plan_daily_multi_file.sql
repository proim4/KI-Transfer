-- Real usage shows BDR130 (Daily transfer plan) also routinely comes as
-- several files per week (one per day), same as the 3 Supply Daily sources —
-- move it onto the same multi-file model (migration 0012). ABS0000 and
-- BSR030 (Weekly) stay single-file: only Daily plan changes here.

alter table upload_files drop constraint upload_files_file_type_check;
alter table upload_files add constraint upload_files_file_type_check
  check (file_type in (
    'supply_daily_bsd010', 'pricing_daily', 'bidding_tc05', 'plan_daily_bdr130'
  ));

alter table plan_rows add column upload_file_id uuid references upload_files (id) on delete cascade;
create index plan_rows_upload_file_idx on plan_rows (upload_file_id);

-- Backfill: every week's existing single-file BDR130 Daily upload becomes an
-- upload_files row, and its already-live plan_rows (source_file='daily') get
-- tagged to it — so real, already-uploaded data doesn't just vanish from the
-- new per-file list.
do $$
declare
  u record;
  new_id uuid;
begin
  for u in select * from uploads where file_type = 'plan_daily_bdr130' and status = 'validated' loop
    insert into upload_files (week_id, file_type, original_filename, storage_path, status, row_count, skipped_count, error_report)
    values (u.week_id, 'plan_daily_bdr130', u.original_filename, u.storage_path, u.status, u.row_count, u.skipped_count, u.error_report)
    returning id into new_id;

    update plan_rows set upload_file_id = new_id
    where week_id = u.week_id and source_file = 'daily' and upload_file_id is null;
  end loop;
end $$;

-- plan_daily_bdr130 no longer uses the single-file uploads table at all.
delete from uploads where file_type = 'plan_daily_bdr130';
