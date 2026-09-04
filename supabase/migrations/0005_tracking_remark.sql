-- Free-text remark per tracking row, editable inline in the Tracking tables
-- and included in the Excel export. Presentation-only addition — does not
-- feed into any calculation.
alter table tracking_results add column remark text;
