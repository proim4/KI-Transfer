import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UploadDropzone from '../components/UploadDropzone';
import WeekSelector from '../components/WeekSelector';
import { useUploads } from '../hooks/useUploads';
import { supabase } from '../lib/supabase';

export default function Upload() {
  const [weekId, setWeekId] = useState<string | null>(null);
  const { data: uploads } = useUploads(weekId);
  const navigate = useNavigate();

  const allValidated =
    !!weekId &&
    (['actual_abs0000', 'plan_weekly_bsr030', 'plan_daily_bdr130'] as const).every(
      (t) => uploads?.find((u) => u.file_type === t)?.status === 'validated',
    );

  const processMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-week', { body: { weekId } });
      if (error) throw error;
      return data as { trackingRowCount: number; unmatchedRowCount: number };
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Upload Data</h1>
        <WeekSelector value={weekId} onChange={setWeekId} />
      </div>

      {weekId && (
        <>
          <div className="space-y-4">
            <UploadDropzone
              weekId={weekId}
              fileType="actual_abs0000"
              label="โอนจริง (ABS0000)"
              hint="ไฟล์ Export จาก Smart Sales: ABS0000_StockTransfers"
            />
            <UploadDropzone
              weekId={weekId}
              fileType="plan_weekly_bsr030"
              label="แผนโอนรายสัปดาห์ (BSR030 Weekly)"
              hint="ไฟล์ Export จาก Smart Sales: BSR030_BsTransferReport"
            />
            <UploadDropzone
              weekId={weekId}
              fileType="plan_daily_bdr130"
              label="แผนโอนรายวัน (BDR130 Daily)"
              hint="ไฟล์ Export จาก Smart Sales: BDR130_BsTransferReport"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              disabled={!allValidated || processMutation.isPending}
              onClick={() => processMutation.mutate()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {processMutation.isPending ? 'กำลังประมวลผล...' : 'ประมวลผล'}
            </button>
            {!allValidated && <p className="mt-2 text-xs text-gray-500">อัพโหลดและตรวจสอบให้ผ่านครบทั้ง 3 ไฟล์ก่อน</p>}
            {processMutation.isSuccess && (
              <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
                ประมวลผลสำเร็จ: {processMutation.data.trackingRowCount} แถว
                {processMutation.data.unmatchedRowCount > 0 &&
                  ` (พบการโอนที่ไม่ตรงกับแผน ${processMutation.data.unmatchedRowCount} กลุ่ม)`}
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="ml-2 font-medium underline"
                >
                  ไปที่ Dashboard
                </button>
              </div>
            )}
            {processMutation.isError && (
              <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                ประมวลผลไม่สำเร็จ: {(processMutation.error as Error).message}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
