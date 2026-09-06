-- "on time" filing was an invented rule with no basis in the source Excel
-- (BSD010 carries no per-row timestamp) — and it turned out to be silently
-- broken since migration 0012 moved supply_daily_bsd010 uploads onto the
-- upload_files table (this column's value was computed from `uploads`,
-- which that file type stopped writing to). Removed per product decision:
-- "filed" now stays purely existence-based, using the dates as they appear
-- in the uploaded file itself.
alter table supply_daily_results drop column filed_on_time;
