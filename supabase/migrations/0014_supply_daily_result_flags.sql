-- Exposes the raw (ungated) Bidding/pricing conditions alongside the
-- existing off-plan-gated ones, plus explicit "master data couldn't resolve"
-- flags -- see supplyDailyCalcEngine.ts. Needed for dashboard totals
-- ("จำนวนรายการ Bidding"/"จำนวนรายการลงราคา") and the data-quality
-- requirement that an unresolved match must show up as its own status, not
-- silently read as "no exception".
alter table supply_daily_results
  add column is_priced_down boolean not null default false,
  add column is_low_bid boolean not null default false,
  add column origin_zone_unresolved boolean not null default false,
  add column vendor_group_unresolved boolean not null default false;
