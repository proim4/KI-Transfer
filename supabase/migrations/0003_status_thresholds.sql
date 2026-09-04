-- Status badge (🟢/🟡/🔴) thresholds and colors, configurable from Settings
-- rather than hardcoded — see frontend/src/lib/statusBadge.ts for the pure
-- zone-computation logic that reads these. Presentation only: derived from
-- tracking_results.total_pct/overage, which are unchanged Excel-verified values.

alter table app_settings
  add column status_high_pct numeric not null default 1.0,
  add column status_low_pct numeric not null default 0.9,
  add column status_high_color text not null default 'green' check (status_high_color in ('green', 'amber', 'red', 'navy', 'blue', 'gray')),
  add column status_mid_color text not null default 'amber' check (status_mid_color in ('green', 'amber', 'red', 'navy', 'blue', 'gray')),
  add column status_low_color text not null default 'red' check (status_low_color in ('green', 'amber', 'red', 'navy', 'blue', 'gray'));
