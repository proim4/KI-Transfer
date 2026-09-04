/**
 * A purely decorative echo of the source workbook's "กด Refresh PivotTable"
 * corner cell (row 1–2 of the Excel reference) — styled like a spreadsheet
 * cell (small, light pink, bold text) rather than a modern button. This app
 * has no stale pivot cache to refresh — every table already reads live,
 * already-filtered data straight from Postgres — so it's intentionally
 * inert, not wired to any action.
 */
export default function RefreshPivotBox() {
  return (
    <div className="mb-2 mt-1 inline-flex w-32 flex-col items-center gap-1 border border-pink-200 bg-pink-50 px-2 py-1.5 text-center text-[11px] font-bold leading-tight text-gray-800">
      <span>กด Refresh</span>
      <span>PivotTable</span>
      <input type="checkbox" checked readOnly className="h-3.5 w-3.5" />
    </div>
  );
}
