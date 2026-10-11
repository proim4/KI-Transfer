import { useState } from 'react';
import { useAppSettings } from '../hooks/useAppSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDeleteWeek, useWeekDataCounts } from '../hooks/useWeeks';
import type { WeekRow } from '../types/db';

interface DeleteWeekButtonProps {
  week: WeekRow;
  /** Called after the week is gone, so the page can move off it. */
  onDeleted: () => void;
}

/**
 * Removes a week created by mistake (e.g. the wrong year). An empty week can be
 * deleted by anyone who can upload; one that already holds uploads or results
 * needs an admin (same rule as Settings: admin, or login switched off), since
 * that wipes every file and result of the week for good.
 */
export default function DeleteWeekButton({ week, onDeleted }: DeleteWeekButtonProps) {
  const [open, setOpen] = useState(false);
  const { isAdmin } = useCurrentUser();
  const { data: settings } = useAppSettings();
  const canDeleteData = !(settings?.require_login ?? true) || isAdmin;
  const counts = useWeekDataCounts(week.id, open);
  const deleteWeek = useDeleteWeek();

  const hasData = !!counts.data && (counts.data.fileCount > 0 || counts.data.trackingCount > 0);
  const blocked = hasData && !canDeleteData;
  const name = `${week.label} (${week.year_no})`;

  function close() {
    setOpen(false);
    deleteWeek.reset();
  }

  function handleDelete() {
    // Failure is shown in the dialog from deleteWeek.error.
    deleteWeek.mutate(week.id, {
      onSuccess: () => {
        setOpen(false);
        onDeleted();
      },
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`ลบ ${name}`}
        className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        ลบ Week
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-gray-900">ลบ {name}?</h2>
            {counts.isLoading && <p className="mb-5 text-sm text-gray-500">กำลังตรวจสอบข้อมูลใน Week นี้...</p>}
            {counts.isError && <p className="mb-5 text-sm text-red-600">ตรวจสอบข้อมูลไม่สำเร็จ: {(counts.error as Error).message}</p>}
            {counts.data && !hasData && <p className="mb-5 text-sm text-gray-600">Week นี้ยังไม่มีไฟล์หรือผลประมวลผล ลบได้ทันที</p>}
            {counts.data && hasData && (
              <div className="mb-5 space-y-2 text-sm">
                <p className="text-gray-600">
                  Week นี้มีไฟล์อัปโหลด {counts.data.fileCount.toLocaleString('en-US')} ไฟล์ และผลประมวลผล{' '}
                  {counts.data.trackingCount.toLocaleString('en-US')} แถว
                </p>
                <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                  ไฟล์ ผลประมวลผล หมายเหตุ และการปรับโอนจริงทั้งหมดของ Week นี้จะถูกลบถาวร กู้คืนไม่ได้
                </p>
                {blocked && <p className="text-amber-700">ลบ Week ที่มีข้อมูลแล้วได้เฉพาะผู้ดูแลระบบ</p>}
              </div>
            )}
            {deleteWeek.isError && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">ลบไม่สำเร็จ: {(deleteWeek.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={deleteWeek.isPending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!counts.data || blocked || deleteWeek.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleteWeek.isPending ? 'กำลังลบ...' : 'ลบ Week'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
