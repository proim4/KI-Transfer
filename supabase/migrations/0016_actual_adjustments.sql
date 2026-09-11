-- Lets a user adjust "โอนจริง" (ABS0000 actual_total) per route directly from
-- the Tracking page, instead of re-uploading ABS0000, when the figure needs a
-- manual correction. actual_total is shared across every price-variant row of
-- the same (week, production_date, origin, dest, product_group) route (see
-- calcEngine.ts's matchKey) — an adjustment applies to all of them so the
-- table and every derived Summary stay internally consistent.
--
-- actual_original preserves the pre-adjustment (raw ABS0000-derived) figure
-- so "original vs adjusted" stays inspectable; it is set once, on the first
-- adjustment, and left alone by later ones (see process-week's own comment
-- for how a later re-upload interacts with this).
alter table tracking_results
  add column actual_original numeric,
  add column is_adjusted boolean not null default false,
  add column adjusted_by uuid,
  add column adjusted_by_name text,
  add column adjusted_at timestamptz,
  add column adjustment_reason text;

-- Append-only audit trail, one row per adjustment action (not per
-- tracking_results row it touched) — every adjustment made against the route
-- is kept, even after a later adjustment or a week reprocess changes the
-- current value. Keyed by the route's natural key rather than
-- tracking_results.id, since process-week deletes and reinserts that table's
-- rows (fresh identity values) on every recompute.
create table tracking_actual_adjustments (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  production_date date not null,
  origin_code text not null,
  origin_name text not null,
  dest_code text not null,
  dest_name text not null,
  product_group text not null,
  previous_actual numeric not null,
  new_actual numeric not null,
  reason text not null,
  adjusted_by uuid,
  adjusted_by_name text,
  created_at timestamptz not null default now()
);

create index tracking_actual_adjustments_route_idx
  on tracking_actual_adjustments (week_id, production_date, origin_code, dest_code, product_group, created_at desc);

alter table tracking_actual_adjustments enable row level security;

create policy tracking_actual_adjustments_all on tracking_actual_adjustments
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on tracking_actual_adjustments to anon, authenticated;
