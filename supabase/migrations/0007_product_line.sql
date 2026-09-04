-- Adds a product_line concept to weeks so a second parallel dataset (pork)
-- can coexist with the existing chicken data without touching any downstream
-- table — plan_rows/actual_rows/tracking_results/unmatched_actual/uploads all
-- already scope through week_id (FK cascade), so they inherit product_line
-- for free.
alter table weeks
  add column product_line text not null default 'chicken'
    check (product_line in ('chicken', 'pork'));

-- The original unique(year_no, week_no) (auto-named by Postgres at CREATE
-- TABLE time) must widen to include product_line, so "WK36 (2026)" can exist
-- once for chicken and once for pork.
alter table weeks drop constraint weeks_year_no_week_no_key;
alter table weeks add constraint weeks_year_no_week_no_product_line_key
  unique (year_no, week_no, product_line);
