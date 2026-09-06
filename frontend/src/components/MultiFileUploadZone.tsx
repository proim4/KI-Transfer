import { useRef, useState, type DragEvent } from 'react';
import { useMultiFileUpload } from '../hooks/useMultiFileUpload';
import { useProcessWeek } from '../hooks/useProcessWeek';
import { useDeleteUploadFile, useUploadFiles } from '../hooks/useUploadFiles';
import type { MultiFileUploadType, UploadFileRow } from '../types/db';
import ConfirmDialog from './ConfirmDialog';

interface MultiFileUploadZoneProps {
  weekId: string;
  fileType: MultiFileUploadType;
  label: string;
  hint: string;
}

function downloadErrors(filename: string, errors: UploadFileRow['error_report']) {
  if (!errors) return;
  const header = 'แถวที่,สาเหตุ\n';
  const body = errors.map((e) => `${e.rowNumber},"${e.reason.replace(/"/g, '""')}"`).join('\n');
  const blob = new Blob([`﻿${header}${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx'];
function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const statusBadge: Record<UploadFileRow['status'], { text: string; className: string }> = {
  uploaded: { text: 'อัพโหลดแล้ว', className: 'bg-gray-100 text-gray-600' },
  validating: { text: 'กำลังตรวจสอบ...', className: 'bg-amber-100 text-amber-700' },
  validated: { text: '✓ สำเร็จ', className: 'bg-green-100 text-green-700' },
  error: { text: 'พบข้อผิดพลาด', className: 'bg-red-100 text-red-700' },
};

/**
 * Upload widget for the 3 Supply Daily sources that support several files
 * per week (BSD010/ราคารายวัน/TC05 — one file per day, all combining, see
 * migration 0012) — unlike UploadDropzone (ABS0000/BSR030/BDR130), which
 * holds exactly one current file per category. Selecting/dropping several
 * files at once uploads them one by one, then recomputes the week once.
 */
export default function MultiFileUploadZone({ weekId, fileType, label, hint }: MultiFileUploadZoneProps) {
  const { data: files } = useUploadFiles(weekId, fileType);
  const uploadMutation = useMultiFileUpload();
  const processWeek = useProcessWeek();
  const deleteMutation = useDeleteUploadFile(weekId, fileType);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batch, setBatch] = useState<{ total: number; done: number } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<UploadFileRow | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  async function uploadBatch(fileList: File[]) {
    const valid = fileList.filter((f) => hasAcceptedExtension(f.name));
    if (valid.length < fileList.length) {
      setDropError('รองรับเฉพาะไฟล์ .xls หรือ .xlsx เท่านั้น — ไฟล์อื่นถูกข้าม');
    } else {
      setDropError(null);
    }
    if (valid.length === 0) return;

    setBatch({ total: valid.length, done: 0 });
    for (const file of valid) {
      await uploadMutation.mutateAsync({ weekId, fileType, file });
      setBatch((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    setBatch(null);
    await processWeek.mutateAsync(weekId);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    void uploadBatch(Array.from(e.dataTransfer.files ?? []));
  }

  const rows = files ?? [];
  const isBusy = batch !== null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-md p-3 transition-colors ${isDragOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              void uploadBatch(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            เลือกไฟล์ (เลือกได้หลายไฟล์)
          </button>
        </div>
      </div>

      {dropError && <p className="mt-2 text-xs text-red-600">{dropError}</p>}
      {batch && (
        <p className="mt-2 text-xs text-amber-700">
          กำลังอัปโหลด {batch.done}/{batch.total} ไฟล์...
        </p>
      )}

      {rows.length === 0 && !isBusy && <p className="mt-2 text-xs text-gray-400">ยังไม่มีไฟล์</p>}

      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => {
            const badge = statusBadge[row.status];
            return (
              <li key={row.id} className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${badge.className}`}>{badge.text}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700" title={row.original_filename}>
                    {row.original_filename}
                  </span>
                  {row.status === 'validated' && (
                    <span className="shrink-0 text-gray-500">
                      {row.row_count} แถว{row.skipped_count > 0 && ` (ข้าม ${row.skipped_count} แถวที่ไม่เกี่ยวข้อง)`}
                    </span>
                  )}
                  {row.status === 'error' && row.error_report && row.error_report.length > 0 && (
                    <button
                      type="button"
                      onClick={() => downloadErrors(`errors_${fileType}_${row.original_filename}.csv`, row.error_report)}
                      className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-1 text-red-700 hover:bg-red-50"
                    >
                      ดาวน์โหลด Error
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingDeleteRow(row)}
                    title="ลบไฟล์นี้"
                    className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    🗑
                  </button>
                </div>
                {row.status === 'error' && row.error_report && (
                  <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-red-600">
                    {row.error_report.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        แถว {e.rowNumber}: {e.reason}
                      </li>
                    ))}
                    {row.error_report.length > 10 && <li>...และอีก {row.error_report.length - 10} รายการ</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingDeleteRow && (
        <ConfirmDialog
          title="ต้องการลบไฟล์นี้หรือไม่?"
          message={`"${pendingDeleteRow.original_filename}" จะถูกลบพร้อมข้อมูลที่ประมวลผลจากไฟล์นี้ และระบบจะคำนวณผลลัพธ์ใหม่ทันที`}
          confirmLabel="ยืนยันการลบ"
          danger
          onConfirm={() => {
            deleteMutation.mutate(pendingDeleteRow);
            setPendingDeleteRow(null);
          }}
          onCancel={() => setPendingDeleteRow(null)}
        />
      )}
    </div>
  );
}
