import { useRef } from 'react';
import { useFileUpload } from '../hooks/useFileUpload';
import { useUploadFor } from '../hooks/useUploads';
import type { UploadErrorEntry, UploadFileType } from '../types/db';

interface UploadDropzoneProps {
  weekId: string;
  fileType: UploadFileType;
  label: string;
  hint: string;
}

function downloadErrors(filename: string, errors: UploadErrorEntry[]) {
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

export default function UploadDropzone({ weekId, fileType, label, hint }: UploadDropzoneProps) {
  const upload = useUploadFor(weekId, fileType);
  const mutation = useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    mutation.mutate({ weekId, fileType, file });
  }

  const isBusy = mutation.isPending || upload?.status === 'validating';
  const status = isBusy ? 'validating' : (upload?.status ?? 'none');

  const statusBadge: Record<string, { text: string; className: string }> = {
    none: { text: 'ยังไม่อัพโหลด', className: 'bg-gray-100 text-gray-600' },
    validating: { text: 'กำลังตรวจสอบ...', className: 'bg-amber-100 text-amber-700' },
    validated: {
      text:
        upload && upload.skipped_count > 0
          ? `สำเร็จ (${upload.row_count} แถว, ข้าม ${upload.skipped_count} แถวที่ไม่เกี่ยวข้อง)`
          : `สำเร็จ (${upload?.row_count ?? 0} แถว)`,
      className: 'bg-green-100 text-green-700',
    },
    error: { text: `พบข้อผิดพลาด (${upload?.error_report?.length ?? 0} รายการ)`, className: 'bg-red-100 text-red-700' },
  };
  const badge = statusBadge[status];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{label}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.text}</span>
      </div>
      <p className="mb-3 text-xs text-gray-500">{hint}</p>
      {upload?.original_filename && (
        <p className="mb-2 truncate text-xs text-gray-400">ไฟล์ล่าสุด: {upload.original_filename}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {upload ? 'อัพโหลดไฟล์ใหม่ (แทนที่)' : 'เลือกไฟล์'}
        </button>
        {status === 'error' && upload?.error_report && upload.error_report.length > 0 && (
          <button
            type="button"
            onClick={() => downloadErrors(`errors_${fileType}.csv`, upload.error_report!)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            ดาวน์โหลดรายการ Error
          </button>
        )}
      </div>
      {status === 'error' && upload?.error_report && (
        <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-red-600">
          {upload.error_report.slice(0, 20).map((e, i) => (
            <li key={i}>
              แถว {e.rowNumber}: {e.reason}
            </li>
          ))}
          {upload.error_report.length > 20 && <li>...และอีก {upload.error_report.length - 20} รายการ</li>}
        </ul>
      )}
    </div>
  );
}
