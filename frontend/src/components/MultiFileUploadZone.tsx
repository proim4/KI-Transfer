import { useRef, useState, type DragEvent } from 'react';
import { useMultiFileUpload } from '../hooks/useMultiFileUpload';
import { useProcessWeek } from '../hooks/useProcessWeek';
import { useDeleteUploadFile, useUploadFiles } from '../hooks/useUploadFiles';
import { SUSPECTED_EXPORT_ROW_LIMIT, looksTruncated } from '../lib/duplicateUpload';
import { supabase } from '../lib/supabase';
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

/** Row counts in this zone use thousands separators, matching the "5,000" export-cap note. */
function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Past this many files the list scrolls inside the card instead of stretching the whole column. */
const SCROLL_AFTER_FILES = 4;

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx'];
function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const statusBadge: Record<UploadFileRow['status'], { text: string; className: string }> = {
  uploaded: { text: 'อัปโหลดแล้ว', className: 'bg-gray-100 text-gray-600' },
  validating: { text: 'กำลังตรวจสอบ...', className: 'bg-amber-100 text-amber-700' },
  validated: { text: '✓ สำเร็จ', className: 'bg-green-100 text-green-700' },
  error: { text: 'พบข้อผิดพลาด', className: 'bg-red-100 text-red-700' },
};

/**
 * Upload widget for the sources that support several files per week
 * (BSD010/ราคารายวัน/TC05/BDR130/ABS0000 — all files in a category combine,
 * see migrations 0012/0013/0018) — unlike UploadDropzone (BSR030), which
 * holds exactly one current file per category. Selecting/dropping several
 * files at once uploads them one by one, then recomputes the week once.
 */
export default function MultiFileUploadZone({ weekId, fileType, label, hint }: MultiFileUploadZoneProps) {
  const { data: files } = useUploadFiles(weekId, fileType);
  const uploadMutation = useMultiFileUpload();
  const processWeek = useProcessWeek();
  const deleteMutation = useDeleteUploadFile(weekId);
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
  const validatedRows = rows.filter((r) => r.status === 'validated');
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const truncatedCount = validatedRows.filter((r) => looksTruncated(r.row_count + r.skipped_count)).length;

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
            + เพิ่มไฟล์
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
        <p className="mt-2 text-xs text-gray-500">
          {rows.length} ไฟล์ · รวม {formatCount(validatedRows.reduce((a, r) => a + r.row_count, 0))} แถว
          {errorCount > 0 && <span className="text-red-600"> · ไม่ผ่าน {errorCount} ไฟล์</span>}
        </p>
      )}
      {rows.length > 0 && (
        <ul className={`mt-1 space-y-1 ${rows.length > SCROLL_AFTER_FILES ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
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
                      {formatCount(row.row_count)} แถว
                      {row.skipped_count > 0 && ` (ข้าม ${formatCount(row.skipped_count)} แถวที่ไม่เกี่ยวข้อง)`}
                    </span>
                  )}
                  {row.status === 'validated' && looksTruncated(row.row_count + row.skipped_count) && (
                    <span
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700"
                      title="จำนวนแถวเท่ากับเพดาน Export ของระบบต้นทางพอดี — อาจถูกตัด"
                    >
                      {formatCount(SUSPECTED_EXPORT_ROW_LIMIT)} แถวพอดี
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
                  {row.storage_path && (
                    <button
                      type="button"
                      onClick={() => downloadOriginalFile(row.storage_path!, row.original_filename)}
                      title="ดาวน์โหลดไฟล์ต้นฉบับ"
                      className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                    >
                      ⬇
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
      {truncatedCount > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          ⚠ มี {truncatedCount} ไฟล์ที่มี {formatCount(SUSPECTED_EXPORT_ROW_LIMIT)} แถวพอดี ซึ่งเป็นเพดาน Export ของระบบต้นทาง —
          ตรวจว่าได้ Export ครบทุกช่วงวันที่แล้ว ถ้ายังไม่ครบให้แบ่งช่วงวันที่แล้วเพิ่มไฟล์ที่เหลือ
        </p>
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
