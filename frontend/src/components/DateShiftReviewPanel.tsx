import { useState } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDateShiftDecisions, useDecideDateShift, useUndoDateShift } from '../hooks/useDateShiftDecisions';
import type { UnmatchedActualRow } from '../types/db';
import ConfirmDialog from './ConfirmDialog';
import { formatKg } from './KpiCard';

interface DateShiftReviewPanelProps {
  weekId: string;
  unmatched: UnmatchedActualRow[];
}

function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function offsetLabel(offset: number | null): string {
  return offset === 1 ? 'โอนช้า 1 วัน' : offset === -1 ? 'โอนก่อน 1 วัน' : '';
}

/**
 * Review list for the ±1-day rule: actual transfers with no plan on their own
 * date, whose route + product group is planned (and still short) one day
 * either side. Nothing is credited to the plan until a user confirms it here;
 * confirmed/rejected decisions can be withdrawn.
 */
export default function DateShiftReviewPanel({ weekId, unmatched }: DateShiftReviewPanelProps) {
  const { session, profile } = useCurrentUser();
  const { data: decisions } = useDateShiftDecisions(weekId);
  const decide = useDecideDateShift();
  const undo = useUndoDateShift();
  const [confirmAll, setConfirmAll] = useState(false);
  const [showDecided, setShowDecided] = useState(false);

  const pending = unmatched.filter((u) => u.shift_status === 'pending');
  const decided = decisions ?? [];
  if (pending.length === 0 && decided.length === 0) return null;

  const pendingKg = pending.reduce((a, u) => a + Number(u.total_weight_kg), 0);
  const busy = decide.isPending || undo.isPending;
  const userName = profile?.username ?? session?.user.email ?? 'ไม่ระบุผู้ใช้';
  const userId = session?.user.id ?? null;
  const error = (decide.error ?? undo.error) as Error | null;

  function decideItems(items: UnmatchedActualRow[], decision: 'confirmed' | 'rejected') {
    decide.mutate({ weekId, items, decision, userId, userName });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">โอนจริงต่างวันจากแผน ±1 วัน</h2>
          <p className="text-xs text-gray-600">
            เส้นทางและกลุ่มสินค้าตรงกับแผนแต่วันที่ต่างกัน 1 วัน — จะนับรวมในแผนวันนั้นเมื่อกด "ยืนยัน" เท่านั้น
            และแสดงในช่องหมายเหตุของแถวแผน
          </p>
        </div>
        {pending.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40"
          >
            ยืนยันทั้งหมด ({pending.length})
          </button>
        )}
      </div>

      {busy && <p className="mb-2 text-xs text-amber-700">กำลังบันทึกและประมวลผลใหม่...</p>}
      {error && <p className="mb-2 text-xs text-red-600">บันทึกไม่สำเร็จ: {error.message}</p>}

      {pending.length > 0 ? (
        <>
          <p className="mb-1 text-sm text-gray-700">
            รอยืนยัน {pending.length} รายการ · {formatKg(pendingKg)}
          </p>
          <div className="max-h-80 overflow-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">วันที่โอน</th>
                  <th className="px-2 py-1.5 text-left font-medium">นับเป็นแผนวันที่</th>
                  <th className="px-2 py-1.5 text-left font-medium">ต้นทาง → ปลายทาง</th>
                  <th className="px-2 py-1.5 text-left font-medium">กลุ่มสินค้า</th>
                  <th className="px-2 py-1.5 text-right font-medium">น้ำหนัก</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap px-2 py-1">{dayMonth(u.transfer_date)}</td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {dayMonth(u.suggested_plan_date!)} <span className="text-gray-500">({offsetLabel(u.day_offset)})</span>
                    </td>
                    <td className="px-2 py-1">
                      {u.origin_name} → {u.dest_name}
                    </td>
                    <td className="px-2 py-1">{u.product_group}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">{formatKg(Number(u.total_weight_kg))}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decideItems([u], 'confirmed')}
                        className="mr-1 rounded border border-green-300 bg-white px-2 py-0.5 text-green-700 hover:bg-green-50 disabled:opacity-40"
                      >
                        ยืนยัน
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decideItems([u], 'rejected')}
                        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        ไม่นับ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-600">ไม่มีรายการรอยืนยัน</p>
      )}

      {decided.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDecided((v) => !v)} className="text-xs font-medium text-blue-600 hover:underline">
            {showDecided ? '▴' : '▾'} ตัดสินแล้ว {decided.length} รายการ (ยืนยัน{' '}
            {decided.filter((d) => d.decision === 'confirmed').length} / ไม่นับ {decided.filter((d) => d.decision === 'rejected').length})
          </button>
          {showDecided && (
            <ul className="mt-1 max-h-60 space-y-1 overflow-auto text-xs">
              {decided.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-100 bg-white px-2 py-1">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      d.decision === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {d.decision === 'confirmed' ? 'ยืนยัน' : 'ไม่นับ'}
                  </span>
                  <span className="min-w-0 flex-1">
                    {dayMonth(d.transfer_date)} → แผน {dayMonth(d.target_plan_date)} · {d.origin_name} → {d.dest_name} ·{' '}
                    {d.product_group} · {formatKg(Number(d.weight_kg))}
                  </span>
                  <span className="text-gray-500">โดย {d.decided_by_name ?? '-'}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => undo.mutate({ weekId, id: d.id })}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ยกเลิกการตัดสิน
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirmAll && (
        <ConfirmDialog
          title="ยืนยันทั้งหมด?"
          message={`นับโอนจริง ${pending.length} รายการ (${formatKg(pendingKg)}) เข้ากับแผนวันที่ที่แนะนำ\nระบบจะประมวลผลใหม่และบันทึกผู้ยืนยันไว้ในหมายเหตุ`}
          confirmLabel="ยืนยันทั้งหมด"
          onConfirm={() => {
            decideItems(pending, 'confirmed');
            setConfirmAll(false);
          }}
          onCancel={() => setConfirmAll(false)}
        />
      )}
    </div>
  );
}
