-- BUG-04/08: a route's actual is ONE figure shared by its price variants.
-- Each row now also stores its proportional share (actual_alloc, by its share
-- of the route's total plan) plus the route's Weekly/Daily plan, so totals,
-- overage and profit never count the shared actual once per variant, and a
-- filtered subset of variants gets only its own share.
alter table tracking_results
  add column actual_alloc numeric not null default 0,
  add column route_plan_weekly numeric not null default 0,
  add column route_plan_daily numeric not null default 0;

-- Backfill so existing weeks' totals read correctly even before their next
-- reprocess (process-week recomputes every figure from scratch anyway).
with route as (
  select id,
    sum(plan_weekly) over w as rpw,
    sum(plan_daily) over w as rpd,
    sum(plan_total) over w as rpt,
    count(*) over w as n
  from tracking_results
  window w as (partition by week_id, production_date, origin_code, dest_code, product_group)
)
update tracking_results t set
  route_plan_weekly = route.rpw,
  route_plan_daily = route.rpd,
  actual_alloc = case when route.rpt > 0 then t.actual_total * t.plan_total / route.rpt else t.actual_total / route.n end
from route
where t.id = route.id;

-- BUG-05/14: process-week used to delete a week's results and insert the new
-- ones as separate requests — a failure in between left the week empty or
-- half-filled (and readers could see it mid-way), and every reprocess wiped
-- users' remarks since the fresh rows carried none. Replacing now happens in
-- one transaction, and remarks carry over: exact row (route + price) first,
-- then by route when a price changed between uploads.
create or replace function replace_week_results(p_week_id uuid, p_tracking jsonb, p_unmatched jsonb)
returns void
language plpgsql
as $$
begin
  create temp table _old_remarks on commit drop as
    select production_date, origin_code, dest_code, product_group, origin_price, dest_price, remark
    from tracking_results
    where week_id = p_week_id and remark is not null and remark <> '';

  delete from tracking_results where week_id = p_week_id;
  delete from unmatched_actual where week_id = p_week_id;

  insert into tracking_results (
    week_id, production_date, origin_code, origin_name, dest_code, dest_name, product_group,
    origin_price, dest_price, plan_weekly, plan_daily, plan_total, actual_total, actual_original,
    is_adjusted, adjusted_by, adjusted_by_name, adjusted_at, adjustment_reason, weekly_capped,
    weekly_tolerance_adj, weekly_diff, weekly_pct, daily_capped, daily_tolerance_adj, daily_diff,
    daily_pct, total_capped, total_tolerance_adj, total_diff, total_pct, overage, profit_realized,
    profit_lost, suggest_weekly, suggest_daily, suggest_total, reject_weekly, reject_daily,
    reject_total, reject_pct, system_note, actual_alloc, route_plan_weekly, route_plan_daily
  )
  select
    week_id, production_date, origin_code, origin_name, dest_code, dest_name, product_group,
    origin_price, dest_price, plan_weekly, plan_daily, plan_total, actual_total, actual_original,
    is_adjusted, adjusted_by, adjusted_by_name, adjusted_at, adjustment_reason, weekly_capped,
    weekly_tolerance_adj, weekly_diff, weekly_pct, daily_capped, daily_tolerance_adj, daily_diff,
    daily_pct, total_capped, total_tolerance_adj, total_diff, total_pct, overage, profit_realized,
    profit_lost, suggest_weekly, suggest_daily, suggest_total, reject_weekly, reject_daily,
    reject_total, reject_pct, system_note, actual_alloc, route_plan_weekly, route_plan_daily
  from jsonb_populate_recordset(null::tracking_results, p_tracking);

  insert into unmatched_actual (
    week_id, transfer_date, origin_code, origin_name, dest_code, dest_name, product_group,
    total_weight_kg, suggested_plan_date, day_offset, shift_status
  )
  select
    week_id, transfer_date, origin_code, origin_name, dest_code, dest_name, product_group,
    total_weight_kg, suggested_plan_date, day_offset, shift_status
  from jsonb_populate_recordset(null::unmatched_actual, p_unmatched);

  update tracking_results t set remark = o.remark
  from _old_remarks o
  where t.week_id = p_week_id
    and t.production_date = o.production_date and t.origin_code = o.origin_code
    and t.dest_code = o.dest_code and t.product_group = o.product_group
    and t.origin_price = o.origin_price and t.dest_price = o.dest_price;

  update tracking_results t set remark = o.remark
  from (
    select production_date, origin_code, dest_code, product_group, string_agg(distinct remark, ' / ') as remark
    from _old_remarks
    group by production_date, origin_code, dest_code, product_group
  ) o
  where t.week_id = p_week_id and t.remark is null
    and t.production_date = o.production_date and t.origin_code = o.origin_code
    and t.dest_code = o.dest_code and t.product_group = o.product_group;
end;
$$;

create or replace function replace_supply_daily_results(p_week_id uuid, p_rows jsonb)
returns void
language plpgsql
as $$
begin
  delete from supply_daily_results where week_id = p_week_id;
  insert into supply_daily_results (
    week_id, production_date, origin_code, origin_name, product_group, filed, remaining_qty,
    plan_out, remaining_after_plan, actual_out, is_off_plan, is_off_plan_off_zone,
    is_priced_down_off_plan, is_low_bid_off_plan, is_priced_down, is_low_bid,
    origin_zone_unresolved, vendor_group_unresolved
  )
  select
    week_id, production_date, origin_code, origin_name, product_group, filed, remaining_qty,
    plan_out, remaining_after_plan, actual_out, is_off_plan, is_off_plan_off_zone,
    is_priced_down_off_plan, is_low_bid_off_plan, is_priced_down, is_low_bid,
    origin_zone_unresolved, vendor_group_unresolved
  from jsonb_populate_recordset(null::supply_daily_results, p_rows);
end;
$$;

-- Only process-week (service role) may call these.
revoke execute on function replace_week_results(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function replace_supply_daily_results(uuid, jsonb) from public, anon, authenticated;
grant execute on function replace_week_results(uuid, jsonb, jsonb) to service_role;
grant execute on function replace_supply_daily_results(uuid, jsonb) to service_role;

-- BUG-07: every table was `using (true)` for anon, and the anon key ships in
-- the frontend bundle — anyone could read every figure, rewrite % numbers in
-- tracking_results with no audit trail, delete plans, or switch
-- require_login off. Access now requires an active signed-in user whenever
-- require_login is on (the admin-controlled "no login" mode keeps working as
-- before while it's switched off).
create or replace function can_access_data() returns boolean
language sql security definer stable
set search_path = public
as $$
  select not coalesce((select require_login from app_settings limit 1), true)
    or exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

grant execute on function can_access_data() to anon, authenticated;

-- Raw/upload data the app writes directly.
drop policy weeks_all on weeks;
create policy weeks_access on weeks
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy uploads_all on uploads;
create policy uploads_access on uploads
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy plan_rows_all on plan_rows;
create policy plan_rows_access on plan_rows
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy actual_rows_all on actual_rows;
create policy actual_rows_access on actual_rows
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy upload_history_all on upload_history;
create policy upload_history_access on upload_history
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy supply_daily_rows_all on supply_daily_rows;
create policy supply_daily_rows_access on supply_daily_rows
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy pricing_rows_all on pricing_rows;
create policy pricing_rows_access on pricing_rows
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy bidding_rows_all on bidding_rows;
create policy bidding_rows_access on bidding_rows
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy upload_files_all on upload_files;
create policy upload_files_access on upload_files
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

drop policy tracking_date_shift_decisions_all on tracking_date_shift_decisions;
create policy tracking_date_shift_decisions_access on tracking_date_shift_decisions
  for all to anon, authenticated using (can_access_data()) with check (can_access_data());

-- Computed results: written only by process-week (service role, bypasses
-- RLS). Browsers may read them and edit nothing but tracking_results.remark;
-- โอนจริง adjustments go through apply_actual_adjustment below, which always
-- writes the audit log alongside.
drop policy tracking_results_all on tracking_results;
create policy tracking_results_select on tracking_results
  for select to anon, authenticated using (can_access_data());
create policy tracking_results_update on tracking_results
  for update to anon, authenticated using (can_access_data()) with check (can_access_data());
revoke insert, update, delete on tracking_results from anon, authenticated;
grant update (remark) on tracking_results to anon, authenticated;

drop policy unmatched_actual_all on unmatched_actual;
create policy unmatched_actual_select on unmatched_actual
  for select to anon, authenticated using (can_access_data());
revoke insert, update, delete on unmatched_actual from anon, authenticated;

drop policy supply_daily_results_all on supply_daily_results;
create policy supply_daily_results_select on supply_daily_results
  for select to anon, authenticated using (can_access_data());
revoke insert, update, delete on supply_daily_results from anon, authenticated;

-- Audit trail: read + append only (update/delete already revoked in 0017).
drop policy tracking_actual_adjustments_all on tracking_actual_adjustments;
create policy tracking_actual_adjustments_select on tracking_actual_adjustments
  for select to anon, authenticated using (can_access_data());
create policy tracking_actual_adjustments_insert on tracking_actual_adjustments
  for insert to anon, authenticated with check (can_access_data());

-- apply_actual_adjustment (0017) writes tracking_results' computed columns,
-- which browsers can no longer update directly — it now runs as its owner,
-- gated on the caller's own access, so the audit-logged path is the only way
-- to change โอนจริง. Body otherwise unchanged from 0017 (plus the new
-- actual_alloc column the frontend now sends).
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
  if not can_access_data() then
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

grant execute on function apply_actual_adjustment(bigint[], numeric, jsonb, jsonb) to anon, authenticated;

-- Master data: readable by anyone with access, writable by admins only (unchanged).
drop policy mas_factories_select on mas_factories;
create policy mas_factories_select on mas_factories for select to anon, authenticated using (can_access_data());
drop policy mas_factory_zones_select on mas_factory_zones;
create policy mas_factory_zones_select on mas_factory_zones for select to anon, authenticated using (can_access_data());
drop policy mas_toll_processing_pairs_select on mas_toll_processing_pairs;
create policy mas_toll_processing_pairs_select on mas_toll_processing_pairs for select to anon, authenticated using (can_access_data());
drop policy mas_special_skus_select on mas_special_skus;
create policy mas_special_skus_select on mas_special_skus for select to anon, authenticated using (can_access_data());
drop policy mas_products_select on mas_products;
create policy mas_products_select on mas_products for select to anon, authenticated using (can_access_data());
drop policy mas_sku_representative_select on mas_sku_representative;
create policy mas_sku_representative_select on mas_sku_representative for select to anon, authenticated using (can_access_data());

-- app_settings stays readable by anyone (the Login screen needs
-- require_login), but only an active Admin may change it — except while
-- login is switched off, where Settings is deliberately open to everyone
-- (see AdminGuard) so the switch can be turned back on.
drop policy app_settings_update on app_settings;
create policy app_settings_update on app_settings
  for update to anon, authenticated using (is_admin() or not require_login) with check (true);

-- Uploaded source files.
drop policy transfer_uploads_all on storage.objects;
create policy transfer_uploads_access on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'transfer-uploads' and can_access_data())
  with check (bucket_id = 'transfer-uploads' and can_access_data());
