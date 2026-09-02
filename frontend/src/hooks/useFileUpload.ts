import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ACTUAL_REQUIRED_COLUMNS,
  PLAN_REQUIRED_COLUMNS,
  missingColumns,
  readWorkbookFirstSheet,
  validateActualRows,
  validatePlanRows,
} from '../lib/excelParser';
import { insertInBatches } from '../lib/insertInBatches';
import { supabase } from '../lib/supabase';
import type { UploadErrorEntry, UploadFileType } from '../types/db';
import { uploadsQueryKey } from './useUploads';

export interface UploadFileArgs {
  weekId: string;
  fileType: UploadFileType;
  file: File;
}

export interface UploadFileOutcome {
  status: 'validated' | 'error';
  rowCount: number;
  skippedCount: number;
  errors: UploadErrorEntry[];
}

function planRowToDb(weekId: string, row: ReturnType<typeof validatePlanRows>['rows'][number]) {
  return {
    week_id: weekId,
    source_file: row.sourceFile,
    production_date: row.productionDate,
    origin_code: row.originCode,
    origin_name: row.originName,
    dest_code: row.destCode,
    dest_name: row.destName,
    product_group: row.productGroup,
    origin_price: row.originPrice,
    dest_price: row.destPrice,
    suggest: row.suggest,
    supply_after: row.supplyAfter,
    raw: row,
  };
}

function actualRowToDb(weekId: string, row: ReturnType<typeof validateActualRows>['rows'][number]) {
  return {
    week_id: weekId,
    origin_code: row.originCode,
    origin_name: row.originName,
    dest_code: row.destCode,
    dest_name: row.destName,
    transfer_date: row.transferDate,
    sku_code: row.skuCode,
    sku_name: row.skuName,
    weight_kg: row.weightKg,
    product_group: row.productGroup,
    raw: row,
  };
}

async function saveOutcome(
  weekId: string,
  fileType: UploadFileType,
  originalFilename: string,
  status: 'validated' | 'error',
  rowCount: number,
  skippedCount: number,
  errorReport: UploadErrorEntry[] | null,
  storagePath?: string,
) {
  await supabase.from('uploads').upsert(
    {
      week_id: weekId,
      file_type: fileType,
      original_filename: originalFilename,
      status,
      row_count: rowCount,
      skipped_count: skippedCount,
      error_report: errorReport,
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'week_id,file_type' },
  );
}

export function useFileUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekId, fileType, file }: UploadFileArgs): Promise<UploadFileOutcome> => {
      await supabase.from('uploads').upsert(
        {
          week_id: weekId,
          file_type: fileType,
          original_filename: file.name,
          status: 'validating',
          error_report: null,
        },
        { onConflict: 'week_id,file_type' },
      );

      const { headers, rows: rawRows } = await readWorkbookFirstSheet(file);

      const isActual = fileType === 'actual_abs0000';
      const required = isActual ? ACTUAL_REQUIRED_COLUMNS : PLAN_REQUIRED_COLUMNS;
      const missing = missingColumns(headers, required);

      if (missing.length > 0) {
        const errors: UploadErrorEntry[] = [{ rowNumber: 1, reason: `ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missing.join(', ')}` }];
        await saveOutcome(weekId, fileType, file.name, 'error', 0, 0, errors);
        return { status: 'error', rowCount: 0, skippedCount: 0, errors };
      }

      const table = isActual ? 'actual_rows' : 'plan_rows';
      const sourceFile = fileType === 'plan_weekly_bsr030' ? 'weekly' : 'daily';

      let dbRows: Record<string, unknown>[];
      let rowCount: number;
      let skippedCount: number;

      if (isActual) {
        const { rows, errors, skippedCount: skipped } = validateActualRows(rawRows);
        if (errors.length > 0) {
          // All-or-nothing: don't touch any previously-good data for this
          // slot on a failed re-validation, just report what's wrong.
          await saveOutcome(weekId, fileType, file.name, 'error', 0, skipped, errors);
          return { status: 'error', rowCount: 0, skippedCount: skipped, errors };
        }
        dbRows = rows.map((r) => actualRowToDb(weekId, r));
        rowCount = rows.length;
        skippedCount = skipped;
      } else {
        const { rows, errors, skippedCount: skipped } = validatePlanRows(rawRows, sourceFile);
        if (errors.length > 0) {
          await saveOutcome(weekId, fileType, file.name, 'error', 0, skipped, errors);
          return { status: 'error', rowCount: 0, skippedCount: skipped, errors };
        }
        dbRows = rows.map((r) => planRowToDb(weekId, r));
        rowCount = rows.length;
        skippedCount = skipped;
      }

      const storagePath = `${weekId}/${fileType}/${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage.from('transfer-uploads').upload(storagePath, file, {
        upsert: true,
      });
      if (storageError) throw storageError;

      // Replace, never append — this is what prevents the double-counting
      // risk the original workbook had via Power Query's folder union.
      await supabase.from(table).delete().eq('week_id', weekId).match(isActual ? {} : { source_file: sourceFile });

      await insertInBatches(table, dbRows);

      await saveOutcome(weekId, fileType, file.name, 'validated', rowCount, skippedCount, null, storagePath);
      return { status: 'validated', rowCount, skippedCount, errors: [] };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: uploadsQueryKey(variables.weekId) });
    },
  });
}
