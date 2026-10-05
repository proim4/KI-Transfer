import { useState } from 'react';
import type { TrackingResultRow } from '../types/db';
import ActualAdjustModal from './ActualAdjustModal';
import { formatKg } from './KpiCard';

interface ActualAdjustCellProps {
  row: TrackingResultRow;
  allRows: TrackingResultRow[];
  weekId: string;
}

/** "โอนจริงทั้งหมด" cell — shows the current value plus an Edit affordance that opens ActualAdjustModal, and a small marker when the value has been manually adjusted from its original ABS0000 figure. */
export default function ActualAdjustCell({ row, allRows, weekId }: ActualAdjustCellProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {row.is_adjusted && (
        <span
          title={`ปรับล่าสุดโดย ${row.adjusted_by_name ?? '-'}${row.adjustment_reason ? ` — ${row.adjustment_reason}` : ''}`}
          className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700"
        >
          ปรับแล้ว
        </span>
      )}
      {Math.abs(Number(row.actual_alloc) - Number(row.actual_total)) < 0.005 ? (
        <span>{formatKg(row.actual_total)}</span>
      ) : (
        // A price-variant row: show its own share; editing still adjusts the route's whole actual.
        <span title={`ส่วนของราคานี้ (ตามสัดส่วนแผน) จากโอนจริงทั้งเส้นทาง ${formatKg(Number(row.actual_total))}`}>
          {formatKg(Number(row.actual_alloc))}
          <span className="ml-1 text-[10px] text-gray-400">/ {formatKg(Number(row.actual_total))}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        แก้ไข
      </button>
      {editing && <ActualAdjustModal row={row} allRows={allRows} weekId={weekId} onClose={() => setEditing(false)} />}
    </div>
  );
}
