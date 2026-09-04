import { useState } from 'react';
import { useDeleteUploadHistory, useUploadHistory, useAllUploadHistory } from '../hooks/useUploadHistory';
import { useWeeks } from '../hooks/useWeeks';
import { formatDate, formatDateTime, formatTime } from '../lib/formatDateTime';
import { formatFileSize, groupHistoryByWeek, isCurrentVersion } from '../lib/uploadHistory';
import type { ProductLine, UploadHistoryRow } from '../types/db';
import ConfirmDialog from './ConfirmDialog';

const FILE_TYPE_LABEL: Record<string, string> = {
  actual_abs0000: 'โอนจริง (ABS0000)',
  plan_weekly_bsr030: 'แผนโอน Weekly (BSR030)',
  plan_daily_bdr130: 'แผนโอน Daily (BDR130)',
};

const STATUS_BADGE: Record<string, { text: string; className: string }> = {
  validated: { text: 'Success', className: 'bg-green-100 text-green-700' },
  error: { text: 'Error', className: 'bg-red-100 text-red-700' },
  validating: { text: 'กำลังตรวจสอบ', className: 'bg-amber-100 text-amber-700' },
  uploaded: { text: 'Uploaded', className: 'bg-gray-100 text-gray-600' },
};

/** The per-week file table — same delete flow as before, now only mounted once its week is expanded. */
function WeekHistoryDetail({ weekId }: { weekId: string }) {
  const { data: history, isLoading } = useUploadHistory(weekId);
  const deleteMutation = useDeleteUploadHistory(weekId);
  const [pendingDelete, setPendingDelete] = useState<{ row: UploadHistoryRow; isCurrent: boolean } | null>(null);

  const rows = history ?? [];

  function currentFor(row: UploadHistoryRow) {
    return isCurrentVersion(
      row,
      rows.filter((r) => r.file_type === row.file_type),
    );
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete);
    setPendingDelete(null);
  }

  if (isLoading) return <p className="p-3 text-sm text-gray-500">กำลังโหลด...</p>;
  if (rows.length === 0) return <p className="p-3 text-sm text-gray-500">ยังไม่มีประวัติการอัปโหลด</p>;

  return (
    <div className="overflow-auto border-t border-gray-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">ไฟล์</th>
            <th className="px-3 py-2">เวอร์ชัน</th>
            <th className="px-3 py-2">วันที่</th>
            <th className="px-3 py-2">เวลา</th>
            <th className="px-3 py-2 text-right">ขนาด</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const isCurrent = currentFor(row);
            const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.uploaded;
            return (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="max-w-xs truncate font-medium text-gray-900">{row.original_filename}</div>
                  <div className="text-xs text-gray-400">{FILE_TYPE_LABEL[row.file_type] ?? row.file_type}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">V{row.version}</span>
                  {isCurrent && (
                    <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">ปัจจุบัน</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2 text-gray-600">{formatTime(row.created_at)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{formatFileSize(row.file_size)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.text}</span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ row, isCurrent })}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pendingDelete && (
        <ConfirmDialog
          title="ต้องการลบไฟล์นี้หรือไม่?"
          message={
            pendingDelete.isCurrent
              ? `"${pendingDelete.row.original_filename}" เป็นเวอร์ชันปัจจุบันของช่อง "${
                  FILE_TYPE_LABEL[pendingDelete.row.file_type] ?? pendingDelete.row.file_type
                }"\n\nการลบจะลบข้อมูลที่ประมวลผลจากไฟล์นี้ทั้งหมด และคำนวณผลลัพธ์ใหม่ทันที`
              : `"${pendingDelete.row.original_filename}" เป็นเวอร์ชันเก่าที่ถูกแทนที่แล้ว\n\nการลบจะลบเฉพาะประวัติการอัปโหลดนี้ ไม่กระทบข้อมูลปัจจุบัน`
          }
          confirmLabel="ยืนยันการลบ"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/**
 * Collapsed by default so it never competes with the Dashboard/Upload page
 * for attention — opens to a one-line-per-week summary, each week itself
 * expandable to the full file table (WeekHistoryDetail), lazily fetched.
 */
export default function UploadHistoryPanel({ productLine }: { productLine: ProductLine }) {
  const { data: allHistory } = useAllUploadHistory();
  const { data: weeks } = useWeeks(productLine);

  const summaries = groupHistoryByWeek(allHistory ?? [], weeks ?? []);

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-gray-900 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          ประวัติการอัปโหลด
          <span className="text-xs font-normal text-gray-400">({summaries.length} week)</span>
        </span>
      </summary>
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {summaries.length === 0 && <p className="p-4 text-sm text-gray-500">ยังไม่มีประวัติการอัปโหลด</p>}
        {summaries.map((s) => (
          <details key={s.weekId} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
              <span className="font-medium text-gray-900">{s.weekLabel}</span>
              <span className="text-xs text-gray-500">
                {s.fileCount} Files • อัปเดต {formatDateTime(s.lastUpdated)}
              </span>
            </summary>
            <WeekHistoryDetail weekId={s.weekId} />
          </details>
        ))}
      </div>
    </details>
  );
}
