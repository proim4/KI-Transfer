-- Per-user page access: which product pages a (non-admin) user may open —
-- ไก่ (chicken), หมู (pork), ทั้งหมด (all = the combined page, which also
-- needs both products). "ตั้งค่า" (Settings) stays the existing admin role:
-- Settings/master-data writes are already gated on is_admin(), so a separate
-- flag would only produce a Settings page whose saves fail.
--
-- Existing users keep full product access (the default), so nobody loses
-- access the moment this migration runs.

alter table profiles
  add column page_access text[] not null default '{chicken,pork,all}'
    check (page_access <@ array['chicken', 'pork', 'all']::text[]);

-- Product-level gate on top of can_access_data(): admins see every product;
-- other active users only the product lines in their page_access. Open
-- (require_login off) mode stays open, same as can_access_data().
create or replace function can_access_product(p_product_line text) returns boolean
language sql security definer stable
set search_path = public
as $$
  select not coalesce((select require_login from app_settings limit 1), true)
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and status = 'active'
        and (role = 'admin' or p_product_line = any(page_access))
    );
$$;

-- Every week-scoped table inherits its product line through week_id.
create or replace function can_access_week(p_week_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select can_access_product((select product_line from weeks where id = p_week_id));
$$;

grant execute on function can_access_product(text) to anon, authenticated;
grant execute on function can_access_week(uuid) to anon, authenticated;

-- Storage objects are stored under '<week_id>/<file_type>/...'; anything
-- whose first folder isn't a week id is denied rather than erroring.
create or replace function can_access_storage_path(p_name text) returns boolean
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_week_id uuid;
begin
  begin
    v_week_id := split_part(p_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return can_access_week(v_week_id);
end;
$$;

grant execute on function can_access_storage_path(text) to anon, authenticated;

drop policy weeks_access on weeks;
create policy weeks_access on weeks
  for all to anon, authenticated using (can_access_product(product_line)) with check (can_access_product(product_line));

drop policy uploads_access on uploads;
create policy uploads_access on uploads
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy plan_rows_access on plan_rows;
create policy plan_rows_access on plan_rows
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy actual_rows_access on actual_rows;
create policy actual_rows_access on actual_rows
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy upload_history_access on upload_history;
create policy upload_history_access on upload_history
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy supply_daily_rows_access on supply_daily_rows;
create policy supply_daily_rows_access on supply_daily_rows
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy pricing_rows_access on pricing_rows;
create policy pricing_rows_access on pricing_rows
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy bidding_rows_access on bidding_rows;
create policy bidding_rows_access on bidding_rows
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy upload_files_access on upload_files;
create policy upload_files_access on upload_files
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy tracking_date_shift_decisions_access on tracking_date_shift_decisions;
create policy tracking_date_shift_decisions_access on tracking_date_shift_decisions
  for all to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy tracking_results_select on tracking_results;
create policy tracking_results_select on tracking_results
  for select to anon, authenticated using (can_access_week(week_id));
drop policy tracking_results_update on tracking_results;
create policy tracking_results_update on tracking_results
  for update to anon, authenticated using (can_access_week(week_id)) with check (can_access_week(week_id));

drop policy unmatched_actual_select on unmatched_actual;
create policy unmatched_actual_select on unmatched_actual
  for select to anon, authenticated using (can_access_week(week_id));

drop policy supply_daily_results_select on supply_daily_results;
create policy supply_daily_results_select on supply_daily_results
  for select to anon, authenticated using (can_access_week(week_id));

drop policy tracking_actual_adjustments_select on tracking_actual_adjustments;
create policy tracking_actual_adjustments_select on tracking_actual_adjustments
  for select to anon, authenticated using (can_access_week(week_id));
drop policy tracking_actual_adjustments_insert on tracking_actual_adjustments;
create policy tracking_actual_adjustments_insert on tracking_actual_adjustments
  for insert to anon, authenticated with check (can_access_week(week_id));

drop policy transfer_uploads_access on storage.objects;
create policy transfer_uploads_access on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'transfer-uploads' and can_access_storage_path(name))
  with check (bucket_id = 'transfer-uploads' and can_access_storage_path(name));

-- apply_actual_adjustment (0019) runs as its owner and bypasses RLS, so it
-- checks the week's product itself — same body otherwise.
create or replace function apply_actual_adjustment(
  p_ids bigint[],
  p_expected_actual numeric,
  p_updates jsonb,
  p_log jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
begin
  if not can_access_week((p_log->>'week_id')::uuid)
    or exists (
      select 1 from tracking_results
      where id = any(p_ids) and week_id is distinct from (p_log->>'week_id')::uuid
    )
  then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  perform 1 from tracking_results where id = any(p_ids) for update;

  select actual_total into v_current from tracking_results where id = p_ids[1];
  if v_current is distinct from p_expected_actual then
    raise exception 'stale_actual_total' using errcode = 'P0001';
  end if;

  update tracking_results t set
    actual_total = (u->>'actual_total')::numeric,
    actual_alloc = (u->>'actual_alloc')::numeric,
    weekly_capped = (u->>'weekly_capped')::numeric,
    weekly_tolerance_adj = (u->>'weekly_tolerance_adj')::numeric,
    weekly_diff = (u->>'weekly_diff')::numeric,
    weekly_pct = (u->>'weekly_pct')::numeric,
    daily_capped = (u->>'daily_capped')::numeric,
    daily_tolerance_adj = (u->>'daily_tolerance_adj')::numeric,
    daily_diff = (u->>'daily_diff')::numeric,
    daily_pct = (u->>'daily_pct')::numeric,
    total_capped = (u->>'total_capped')::numeric,
    total_tolerance_adj = (u->>'total_tolerance_adj')::numeric,
    total_diff = (u->>'total_diff')::numeric,
    total_pct = (u->>'total_pct')::numeric,
    overage = (u->>'overage')::numeric,
    profit_realized = (u->>'profit_realized')::numeric,
    profit_lost = (u->>'profit_lost')::numeric,
    actual_original = coalesce(t.actual_original, (u->>'actual_original')::numeric),
    is_adjusted = true,
    adjusted_by = (u->>'adjusted_by')::uuid,
    adjusted_by_name = u->>'adjusted_by_name',
    adjusted_at = (u->>'adjusted_at')::timestamptz,
    adjustment_reason = u->>'adjustment_reason'
  from jsonb_array_elements(p_updates) u
  where t.id = (u->>'id')::bigint;

  insert into tracking_actual_adjustments (
    week_id, production_date, origin_code, origin_name, dest_code, dest_name,
    product_group, previous_actual, new_actual, reason, adjusted_by, adjusted_by_name
  )
  values (
    (p_log->>'week_id')::uuid,
    (p_log->>'production_date')::date,
    p_log->>'origin_code',
    p_log->>'origin_name',
    p_log->>'dest_code',
    p_log->>'dest_name',
    p_log->>'product_group',
    (p_log->>'previous_actual')::numeric,
    (p_log->>'new_actual')::numeric,
    p_log->>'reason',
    (p_log->>'adjusted_by')::uuid,
    p_log->>'adjusted_by_name'
  );
end;
$$;
