import { useRef, useState, type DragEvent } from 'react';
import { useFileUpload } from '../hooks/useFileUpload';
import { useDeleteUploadHistory, useUploadHistory } from '../hooks/useUploadHistory';
import { useUploadFor } from '../hooks/useUploads';
import { supabase } from '../lib/supabase';
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

/** Downloads the original uploaded file back from Supabase Storage, exactly as it was submitted. */
async function downloadOriginalFile(storagePath: string, filename: string) {
  const { data, error } = await supabase.storage.from('transfer-uploads').download(storagePath);
  if (error || !data) return;
  const url = URL.createObjectURL(data);
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

const statusBadge: Record<string, { text: string; className: string }> = {
  none: { text: 'ยังไม่อัพโหลด', className: 'bg-gray-100 text-gray-600' },
  validating: { text: 'กำลังตรวจสอบ...', className: 'bg-amber-100 text-amber-700' },
  validated: { text: '✓ สำเร็จ', className: 'bg-green-100 text-green-700' },
  error: { text: 'พบข้อผิดพลาด', className: 'bg-red-100 text-red-700' },
};

/**
 * Single-file upload widget for ABS0000/BSR030 (Weekly) — one current file
 * per category, replaced on every upload. Laid out to match
 * MultiFileUploadZone's header + list-row style (even though there's only
 * ever at most one row here) so both Upload page boxes look consistent.
 */
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
          <h3 className="font-medium text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">{hint}</p>
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
        </div>
      </div>

      {dropError && <p className="mt-2 text-xs text-red-600">{dropError}</p>}

      {!upload && !isBusy && <p className="mt-2 text-xs text-gray-400">ยังไม่มีไฟล์</p>}

      {(upload || isBusy) && (
        <ul className="mt-2 space-y-1">
          <li className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${badge.className}`}>{badge.text}</span>
              <span className="min-w-0 flex-1 truncate text-gray-700" title={upload?.original_filename}>
                {upload?.original_filename ?? ''}
              </span>
              {status === 'validated' && upload && (
                <span className="shrink-0 text-gray-500">
                  {upload.row_count} แถว{upload.skipped_count > 0 && ` (ข้าม ${upload.skipped_count} แถวที่ไม่เกี่ยวข้อง)`}
                </span>
              )}
              {status === 'error' && upload?.error_report && upload.error_report.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadErrors(`errors_${fileType}.csv`, upload.error_report!)}
                  className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-1 text-red-700 hover:bg-red-50"
                >
                  ดาวน์โหลด Error
                </button>
              )}
              {upload?.storage_path && (
                <button
                  type="button"
                  onClick={() => downloadOriginalFile(upload.storage_path!, upload.original_filename)}
                  title="ดาวน์โหลดไฟล์ต้นฉบับ"
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                >
                  ⬇
                </button>
              )}
              {status === 'validated' && currentHistoryRow && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  title="ลบไฟล์นี้"
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  🗑
                </button>
              )}
            </div>
            {status === 'error' && upload?.error_report && (
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-red-600">
                {upload.error_report.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    แถว {e.rowNumber}: {e.reason}
                  </li>
                ))}
                {upload.error_report.length > 10 && <li>...และอีก {upload.error_report.length - 10} รายการ</li>}
              </ul>
            )}
          </li>
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
