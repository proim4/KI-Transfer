import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LastUpdatedLabel from '../components/LastUpdatedLabel';
import MultiFileUploadZone from '../components/MultiFileUploadZone';
import UploadDropzone from '../components/UploadDropzone';
import WeekSelector from '../components/WeekSelector';
import { useProcessWeek } from '../hooks/useProcessWeek';
import { useUploadFiles } from '../hooks/useUploadFiles';
import { useUploads } from '../hooks/useUploads';
import { lastUpdatedAt } from '../lib/lastUpdated';
import type { ProductLine, UploadFileType } from '../types/db';

// actual_abs0000/plan_weekly_bsr030 stay single-file (checked via `uploads`);
// plan_daily_bdr130 moved to the multi-file model (checked via `upload_files`
// — see REQUIRED_MULTI_FILE_TYPE below), so it's not in this list.
const REQUIRED_SINGLE_FILE_TYPES: Record<ProductLine, UploadFileType[]> = {
  chicken: ['actual_abs0000', 'plan_weekly_bsr030'],
  pork: ['actual_abs0000'],
};
const REQUIRED_MULTI_FILE_COUNT = 1; // both product lines require plan_daily_bdr130

interface UploadProps {
  productLine?: ProductLine;
}

export default function Upload({ productLine = 'chicken' }: UploadProps) {
  const [weekId, setWeekId] = useState<string | null>(null);
  const { data: uploads } = useUploads(weekId);
  const { data: planDailyFiles } = useUploadFiles(weekId, 'plan_daily_bdr130');
  const navigate = useNavigate();

  const requiredSingleFileTypes = REQUIRED_SINGLE_FILE_TYPES[productLine];
  const singleFilesValidated = requiredSingleFileTypes.every(
    (t) => uploads?.find((u) => u.file_type === t)?.status === 'validated',
  );
  const planDailyValidated = (planDailyFiles ?? []).some((f) => f.status === 'validated');
  const requiredFileCount = requiredSingleFileTypes.length + REQUIRED_MULTI_FILE_COUNT;
  const allValidated = !!weekId && singleFilesValidated && planDailyValidated;

  const processMutation = useProcessWeek();

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Upload Data</h1>
        <div className="flex flex-wrap items-center gap-3">
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} allowCreate />
          <LastUpdatedLabel at={lastUpdatedAt(uploads)} />
          {weekId && (
            <button
              type="button"
              disabled={!allValidated || processMutation.isPending}
              onClick={() => processMutation.mutate(weekId)}
              className="rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40"
            >
              {processMutation.isPending ? 'กำลังประมวลผล...' : 'ประมวลผล'}
            </button>
          )}
          {weekId && processMutation.isSuccess && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              ประมวลผลสำเร็จ: {processMutation.data.trackingRowCount} แถว
              {processMutation.data.unmatchedRowCount > 0 &&
                ` (พบการโอนที่ไม่ตรงกับแผน ${processMutation.data.unmatchedRowCount} กลุ่ม)`}
              <button
                type="button"
                onClick={() => navigate(productLine === 'pork' ? '/pork/dashboard' : '/dashboard')}
                className="ml-2 font-medium underline"
              >
                ไปที่ Dashboard
              </button>
            </div>
          )}
          {weekId && processMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              ประมวลผลไม่สำเร็จ: {(processMutation.error as Error).message}
            </p>
          )}
        </div>
        {weekId && !allValidated && (
          <p className="mt-2 text-xs text-gray-500">อัพโหลดและตรวจสอบให้ผ่านครบทั้ง {requiredFileCount} ไฟล์ก่อน</p>
        )}
      </div>

      {weekId && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Upload Excel Files</h2>
              <p className="mb-3 text-sm text-gray-500">รองรับการอัปโหลดหลายไฟล์ — ลากไฟล์มาวางหรือกดเลือกไฟล์ทีละรายการ</p>
              <div className="divide-y divide-gray-100">
                <UploadDropzone
                  weekId={weekId}
                  fileType="actual_abs0000"
                  label="โอนจริง (ABS0000)"
                  hint="ไฟล์ Export จาก Smart Sales: ABS0000_StockTransfers"
                />
                {productLine === 'chicken' && (
                  <UploadDropzone
                    weekId={weekId}
                    fileType="plan_weekly_bsr030"
                    label="แผนโอนรายสัปดาห์ (BSR030 Weekly)"
                    hint="ไฟล์ Export จาก Smart Sales: BSR030_BsTransferReport"
                  />
                )}
                <MultiFileUploadZone
                  weekId={weekId}
                  fileType="plan_daily_bdr130"
                  label="แผนโอนรายวัน (BDR130 Daily)"
                  hint="ไฟล์ Export จาก Smart Sales: BDR130_BsTransferReport — เลือกได้หลายไฟล์ (ไฟล์ชื่อซ้ำจะแทนที่ไฟล์เดิม)"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Upload — ติดตามการกรอก Supply Daily</h2>
              <p className="mb-3 text-sm text-gray-500">
                ไม่บังคับสำหรับการประมวลผลแผนโอน — ใช้เฉพาะ Tab &quot;ติดตามการกรอก Supply Daily&quot; — เลือกได้หลายไฟล์ต่อหัวข้อ
                (ไฟล์ชื่อซ้ำจะแทนที่ไฟล์เดิม)
              </p>
              <div className="divide-y divide-gray-100">
                <MultiFileUploadZone
                  weekId={weekId}
                  fileType="supply_daily_bsd010"
                  label="กรอก Supply Daily (BSD010)"
                  hint="ไฟล์ Export จาก Supply Planning: Actual Balance Supply Daily"
                />
                <MultiFileUploadZone
                  weekId={weekId}
                  fileType="pricing_daily"
                  label="ราคารายวัน"
                  hint="ไฟล์ต้องตั้งชื่อรูปแบบ ChickenW2_DD.MM.YYYY.xlsx (วันที่อ่านจากชื่อไฟล์)"
                />
                <MultiFileUploadZone
                  weekId={weekId}
                  fileType="bidding_tc05"
                  label="รายการ Bidding (TC05)"
                  hint="ไฟล์ Export จาก Supply Planning: Actual allocation"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
