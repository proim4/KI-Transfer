-- `raw` on plan_rows/actual_rows now stores the full original Excel row (see
-- excelParser.ts) so ข้อมูลดิบ can show every column from the uploaded file.
-- jsonb does not preserve object key order (Postgres docs: it re-sorts keys
-- by length then lexicographically) — switching to json (text-based) keeps
-- the original file's column order intact for display.
alter table plan_rows
  alter column raw type json using raw::json,
  alter column raw set default '{}'::json;

alter table actual_rows
  alter column raw type json using raw::json,
  alter column raw set default '{}'::json;
