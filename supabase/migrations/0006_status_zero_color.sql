-- A 4th status zone: exactly 0% transferred against a plan that exists is a
-- distinct, more severe condition than merely "below the low threshold" —
-- gets its own label ("ไม่โอนตามแผน") and configurable color.
alter table app_settings
  add column status_zero_color text not null default 'navy' check (status_zero_color in ('green', 'amber', 'red', 'navy', 'blue', 'gray'));
