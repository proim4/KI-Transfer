import { useMemo, useState } from 'react';
import { siblingsOfRoute, useActualAdjustmentHistory, useAdjustActual } from '../hooks/useTrackingResults';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { recomputeTrackingRow } from '../lib/rowCalc';
import type { TrackingResultRow } from '../types/db';
import { formatBaht, formatKg, formatPct } from './KpiCard';

interface ActualAdjustModalProps {
  row: TrackingResultRow;
  allRows: TrackingResultRow[];
  weekId: string;
  onClose: () => void;
}

function ChannelPreviewRow({
  label,
  beforeDiff,
  afterDiff,
  beforePct,
  afterPct,
}: {
  label: string;
  beforeDiff: number;
  afterDiff: number;
  beforePct: number | null;
  afterPct: number | null;
}) {
  return (
    <tr>
      <td className="py-1 pr-3 text-gray-500">{label}</td>
      <td className="py-1 pr-3 text-right text-gray-400">
        {formatKg(beforeDiff)} · {formatPct(beforePct)}
      </td>
      <td className="py-1 text-right font-medium text-gray-900">
        {formatKg(afterDiff)} · {formatPct(afterPct)}
      </td>
    </tr>
  );
}

/**
 * Adjusts "โอนจริง" (ABS0000 actual_total) for the whole route `row` belongs
 * to — every sibling price-variant row sharing the same
 * date/origin/dest/product_group shares one actual_total (see rowCalc.ts),
 * so they're all previewed and saved together here.
 */
export default function ActualAdjustModal({ row, allRows, weekId, onClose }: ActualAdjustModalProps) {
  const { session, profile } = useCurrentUser();
  const adjustActual = useAdjustActual();
  const { data: history } = useActualAdjustmentHistory(weekId, row);
  const [valueText, setValueText] = useState(String(row.actual_total));
  const [reason, setReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const siblings = useMemo(() => siblingsOfRoute(allRows, row), [allRows, row]);

  const parsed = valueText.trim() === '' ? null : Number(valueText);
  const isValidNumber = parsed !== null && Number.isFinite(parsed);
  const isNonNegative = isValidNumber && parsed >= 0;
  const hasReason = reason.trim() !== '';
  const canSave = isNonNegative && hasReason && !adjustActual.isPending;

  const preview = isNonNegative ? recomputeTrackingRow(row, parsed) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidNumber) return;
    if (!isNonNegative) return;
    if (!hasReason) return;

    const userName = profile?.username ?? session?.user.email ?? 'ไม่ระบุผู้ใช้';
    adjustActual.mutate(
      {
        row,
        siblings,
        newActual: parsed,
        reason: reason.trim(),
        userId: session?.user.id ?? null,
        userName,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="mb-1 text-base font-semibold text-gray-900">แก้ไขโอนจริง (ABS0000)</h2>
        <p className="mb-4 text-xs text-gray-500">
          {row.production_date} · {row.origin_name} → {row.dest_name} · {row.product_group}
          {siblings.length > 1 && ` (มีราคาต้นทาง/ปลายทางต่างกัน ${siblings.length} รายการที่ใช้โอนจริงร่วมกัน)`}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">ค่าเดิม</label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {formatKg(row.actual_total)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">ค่าใหม่ (kg)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              autoFocus
            />
            {!isValidNumber && valueText.trim() !== '' && <p className="mt-1 text-xs text-red-600">กรุณากรอกตัวเลข</p>}
            {isValidNumber && !isNonNegative && <p className="mt-1 text-xs text-red-600">ค่าต้องไม่ติดลบ</p>}
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Preview หลังแก้ไข (ก่อน · หลัง)
            </p>
            <table className="w-full text-xs">
              <tbody>
                <ChannelPreviewRow
                  label="Diff/% Weekly"
                  beforeDiff={row.weekly_diff}
                  afterDiff={preview.weekly_diff}
                  beforePct={row.weekly_pct}
                  afterPct={preview.weekly_pct}
                />
                <ChannelPreviewRow
                  label="Diff/% Daily"
                  beforeDiff={row.daily_diff}
                  afterDiff={preview.daily_diff}
                  beforePct={row.daily_pct}
                  afterPct={preview.daily_pct}
                />
                <ChannelPreviewRow
                  label="Diff/% Total"
                  beforeDiff={row.total_diff}
                  afterDiff={preview.total_diff}
                  beforePct={row.total_pct}
                  afterPct={preview.total_pct}
                />
                <tr>
                  <td className="py-1 pr-3 text-gray-500">กำไรที่ได้</td>
                  <td className="py-1 pr-3 text-right text-gray-400">{formatBaht(row.profit_realized)}</td>
                  <td className="py-1 text-right font-medium text-gray-900">{formatBaht(preview.profit_realized)}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-3 text-gray-500">สูญเสียกำไร</td>
                  <td className="py-1 pr-3 text-right text-gray-400">{formatBaht(row.profit_lost)}</td>
                  <td className="py-1 text-right font-medium text-gray-900">{formatBaht(preview.profit_lost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-sm text-gray-600">
            เหตุผลในการปรับ <span className="text-red-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="เช่น น้ำหนักจริงหลังชั่งไม่ตรงกับ ABS0000"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {row.is_adjusted && (
          <p className="mt-2 text-xs text-gray-500">
            ปรับล่าสุดโดย {row.adjusted_by_name ?? '-'} เมื่อ{' '}
            {row.adjusted_at ? new Date(row.adjusted_at).toLocaleString('th-TH') : '-'}
            {row.adjustment_reason && ` — เหตุผล: ${row.adjustment_reason}`}
          </p>
        )}

        {history && history.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {showHistory ? 'ซ่อนประวัติการปรับ' : `ดูประวัติการปรับทั้งหมด (${history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-md border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
                {history.map((h) => (
                  <li key={h.id}>
                    {new Date(h.created_at).toLocaleString('th-TH')} — {formatKg(h.previous_actual)} →{' '}
                    {formatKg(h.new_actual)} โดย {h.adjusted_by_name ?? '-'} ({h.reason})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {adjustActual.isError && (
          <p className="mt-3 text-sm text-red-600">
            {adjustActual.error instanceof Error ? adjustActual.error.message : 'บันทึกไม่สำเร็จ'}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-50"
          >
            {adjustActual.isPending ? 'กำลังบันทึก...' : 'ยืนยันการแก้ไข'}
          </button>
        </div>
      </form>
    </div>
  );
}
