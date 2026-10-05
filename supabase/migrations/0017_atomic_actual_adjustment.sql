-- Bug fix: adjusting "โอนจริง" (useAdjustActual, added in 0016) previously
-- issued one UPDATE per sibling row via client-side Promise.all with no
-- transaction — if one sibling's UPDATE failed after others had already
-- committed (network blip, concurrent process-week reprocess), the route's
-- price-variant rows were left with different actual_total values and the
-- audit-log insert (which only ran after every UPDATE resolved) was skipped
-- entirely. There was also no check that the route's actual_total hadn't
-- changed since the editor loaded it, so two users adjusting the same route
-- close together could silently overwrite one another with no conflict
-- surfaced to either.
--
-- This function makes the whole adjustment (every sibling UPDATE + the audit
-- log INSERT) one Postgres transaction, and rejects the call if the route's
-- current actual_total no longer matches what the caller expected —
-- actual_total is always written together with actual_original for a route
-- (see 0016's comment), so comparing it alone is sufficient to detect a
-- concurrent edit. The per-row math itself (weekly/daily/total
-- capped/toleranceAdj/diff/pct, overage, profit) is still computed in
-- frontend/src/lib/rowCalc.ts, same as before — this only makes persisting
-- it atomic, it does not duplicate that formula into SQL.
create or replace function apply_actual_adjustment(
  p_ids bigint[],
  p_expected_actual numeric,
  p_updates jsonb,
  p_log jsonb
) returns void
language plpgsql
as $$
declare
  v_current numeric;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  -- Lock every sibling row up front so a second adjustment on the same route
  -- waits for this transaction to finish instead of interleaving with it.
  perform 1 from tracking_results where id = any(p_ids) for update;

  select actual_total into v_current from tracking_results where id = p_ids[1];
  if v_current is distinct from p_expected_actual then
    raise exception 'stale_actual_total' using errcode = 'P0001';
  end if;

  update tracking_results t set
    actual_total = (u->>'actual_total')::numeric,
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
    -- Set once on the first-ever adjustment, left alone by later ones —
    -- computed server-side (rather than trusting the client's guess of
    -- whether it's already set) now that we hold the row lock.
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

-- Bug fix: 0016 documented tracking_actual_adjustments as an "Append-only
-- audit trail" that must be "kept" even after later adjustments, but granted
-- update/delete to anon/authenticated anyway (copy-pasted from the
-- project's usual full-CRUD grant). Since the anon key ships in the frontend
-- bundle, that let anyone erase or rewrite adjustment history directly via
-- the REST API. Only select/insert are ever performed against this table
-- (see useActualAdjustmentHistory and apply_actual_adjustment above), so
-- revoking update/delete actually matches how it's used.
revoke update, delete on tracking_actual_adjustments from anon, authenticated;
