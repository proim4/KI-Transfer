-- Widen the uploads/upload_history file_type enum to accept the 3 new Supply
-- Daily data sources, same mechanical shape as 0007's constraint swap.
alter table uploads drop constraint uploads_file_type_check;
alter table uploads add constraint uploads_file_type_check
  check (file_type in (
    'actual_abs0000', 'plan_weekly_bsr030', 'plan_daily_bdr130',
    'supply_daily_bsd010', 'pricing_daily', 'bidding_tc05'
  ));

alter table upload_history drop constraint upload_history_file_type_check;
alter table upload_history add constraint upload_history_file_type_check
  check (file_type in (
    'actual_abs0000', 'plan_weekly_bsr030', 'plan_daily_bdr130',
    'supply_daily_bsd010', 'pricing_daily', 'bidding_tc05'
  ));
