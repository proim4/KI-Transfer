import { useRef, useState, type DragEvent } from 'react';
import { useFileUpload } from '../hooks/useFileUpload';
import { useDeleteUploadHistory, useUploadHistory } from '../hooks/useUploadHistory';
import { useUploadFor } from '../hooks/useUploads';
import { isCurrentVersion } from '../lib/uploadHistory';
import type { UploadErrorEntry, UploadFileType } from '../types/db';
import ConfirmDialog from './ConfirmDialog';

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

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx'];

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function UploadDropzone({ weekId, fileType, label, hint }: UploadDropzoneProps) {
  const upload = useUploadFor(weekId, fileType);
  const mutation = useFileUpload();
  const { data: history } = useUploadHistory(weekId);
  const deleteMutation = useDeleteUploadHistory(weekId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const slotHistory = (history ?? []).filter((h) => h.file_type === fileType);
  const currentHistoryRow = slotHistory.find((h) => isCurrentVersion(h, slotHistory));

  function startUpload(file: File) {
    mutation.mutate({ weekId, fileType, file });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setDropError(null);
    if (!hasAcceptedExtension(file.name)) {
      setDropError('รองรับเฉพาะไฟล์ .xls หรือ .xlsx เท่านั้น');
      return;
    }
    if (upload?.original_filename === file.name) {
      setPendingDuplicate(file);
      return;
    }
    startUpload(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  const isBusy = mutation.isPending || upload?.status === 'validating';
  const status = isBusy ? 'validating' : (upload?.status ?? 'none');

  const statusBadge: Record<string, { text: string; className: string }> = {
    none: { text: 'ยังไม่อัพโหลด', className: 'bg-gray-100 text-gray-600' },
    validating: { text: 'กำลังตรวจสอบ...', className: 'bg-amber-100 text-amber-700' },
    validated: {
      text:
        upload && upload.skipped_count > 0
          ? `✓ สำเร็จ (${upload.row_count} แถว, ข้าม ${upload.skipped_count} แถวที่ไม่เกี่ยวข้อง)`
          : `✓ สำเร็จ (${upload?.row_count ?? 0} แถว)`,
      className: 'bg-green-100 text-green-700',
    },
    error: { text: `พบข้อผิดพลาด (${upload?.error_report?.length ?? 0} รายการ)`, className: 'bg-red-100 text-red-700' },
  };
  const badge = statusBadge[status];

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
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{label}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.text}</span>
          </div>
          <p className="text-xs text-gray-500">{hint}</p>
          {upload?.original_filename && (
            <p className="truncate text-xs text-gray-400">ไฟล์ล่าสุด: {upload.original_filename}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {upload ? 'อัพโหลดไฟล์ใหม่' : 'เลือกไฟล์'}
          </button>
          {status === 'validated' && currentHistoryRow && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="ลบไฟล์นี้"
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              🗑
            </button>
          )}
          {status === 'error' && upload?.error_report && upload.error_report.length > 0 && (
            <button
              type="button"
              onClick={() => downloadErrors(`errors_${fileType}.csv`, upload.error_report!)}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              ดาวน์โหลดรายการ Error
            </button>
          )}
        </div>
      </div>

      {dropError && <p className="mt-2 text-xs text-red-600">{dropError}</p>}
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

      {pendingDuplicate && (
        <ConfirmDialog
          title="พบไฟล์ชื่อเดียวกันในระบบ"
          message={`พบไฟล์ชื่อ "${pendingDuplicate.name}" ที่เคยอัปโหลดไว้ก่อนหน้านี้\n\nต้องการอัปโหลดทับเป็นเวอร์ชันใหม่หรือไม่?`}
          confirmLabel="เพิ่มเป็นเวอร์ชันใหม่"
          onConfirm={() => {
            startUpload(pendingDuplicate);
            setPendingDuplicate(null);
          }}
          onCancel={() => setPendingDuplicate(null)}
        />
      )}

      {confirmingDelete && currentHistoryRow && (
        <ConfirmDialog
          title="ต้องการลบไฟล์นี้หรือไม่?"
          message={`"${currentHistoryRow.original_filename}" จะถูกลบพร้อมข้อมูลที่ประมวลผลจากไฟล์นี้ และระบบจะคำนวณผลลัพธ์ใหม่ทันที`}
          confirmLabel="ยืนยันการลบ"
          danger
          onConfirm={() => {
            deleteMutation.mutate({ row: currentHistoryRow, isCurrent: true });
            setConfirmingDelete(false);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
