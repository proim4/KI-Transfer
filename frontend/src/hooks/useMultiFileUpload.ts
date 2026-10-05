import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ACTUAL_REQUIRED_COLUMNS,
  BIDDING_REQUIRED_COLUMNS,
  PLAN_REQUIRED_COLUMNS,
  PRICING_REQUIRED_COLUMNS,
  SUPPLY_DAILY_REQUIRED_COLUMNS,
  missingColumns,
  parsePricingFilenameDate,
  readWorkbookFirstSheet,
  validateActualRows,
  validateBiddingRows,
  validatePlanRows,
  validatePricingRows,
  validateSupplyDailyRows,
} from '../lib/excelParser';
import { actualRowFingerprint, findDuplicateFile } from '../lib/duplicateUpload';
import { checkDatesInWeek, describeWeekMismatch, findOverlappingDates, formatDayMonth } from '../lib/uploadChecks';
import { fetchWeekRange } from '../lib/weekRangeOf';
import { fetchAllRows } from '../lib/fetchAllRows';
import { insertInBatches } from '../lib/insertInBatches';
import { supabase } from '../lib/supabase';
import type { MultiFileUploadType, UploadErrorEntry } from '../types/db';
import { LATEST_UPLOAD_STAMPS_QUERY_KEY } from './useLatestWeekId';
import { weekUploadFilesQueryKey } from './useUploadFiles';

export interface UploadMultiFileArgs {
  weekId: string;
  fileType: MultiFileUploadType;
  file: File;
}

export interface UploadMultiFileOutcome {
  status: 'validated' | 'error';
  rowCount: number;
  skippedCount: number;
  errors: UploadErrorEntry[];
}

const REQUIRED_COLUMNS: Record<MultiFileUploadType, readonly string[]> = {
  supply_daily_bsd010: SUPPLY_DAILY_REQUIRED_COLUMNS,
  pricing_daily: PRICING_REQUIRED_COLUMNS,
  bidding_tc05: BIDDING_REQUIRED_COLUMNS,
  plan_daily_bdr130: PLAN_REQUIRED_COLUMNS,
  actual_abs0000: ACTUAL_REQUIRED_COLUMNS,
};

const TABLE: Record<MultiFileUploadType, string> = {
  supply_daily_bsd010: 'supply_daily_rows',
  pricing_daily: 'pricing_rows',
  bidding_tc05: 'bidding_rows',
  plan_daily_bdr130: 'plan_rows',
  actual_abs0000: 'actual_rows',
};

function supplyDailyRowToDb(weekId: string, uploadFileId: string, row: ReturnType<typeof validateSupplyDailyRows>['rows'][number]) {
  return {
    week_id: weekId,
    upload_file_id: uploadFileId,
    production_date: row.productionDate,
    origin_code: row.originCode,
    origin_name: row.originName,
    product_group: row.productGroup,
    product_group_custom: row.productGroupCustom,
    remaining_qty: row.remainingQty,
    raw: row.raw,
  };
}

function pricingRowToDb(weekId: string, uploadFileId: string, row: ReturnType<typeof validatePricingRows>['rows'][number]) {
  return {
    week_id: weekId,
    upload_file_id: uploadFileId,
    price_date: row.priceDate,
    vendor_group: row.vendorGroup,
    product_group: row.productGroup,
    cost_z: row.costZ,
    margin: row.margin,
    net_price: row.netPrice,
    raw: row.raw,
  };
}

function biddingRowToDb(weekId: string, uploadFileId: string, row: ReturnType<typeof validateBiddingRows>['rows'][number]) {
  return {
    week_id: weekId,
    upload_file_id: uploadFileId,
    sales_date: row.salesDate,
    plant_code: row.plantCode,
    product_group: row.productGroup,
    allocate_sp_type: row.allocateSpType,
    is_low_bid: row.isLowBid,
    raw: row.raw,
  };
}

function planDailyRowToDb(weekId: string, uploadFileId: string, row: ReturnType<typeof validatePlanRows>['rows'][number]) {
  return {
    week_id: weekId,
    upload_file_id: uploadFileId,
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
    raw: row.raw,
  };
}

function actualRowToDb(weekId: string, uploadFileId: string, row: ReturnType<typeof validateActualRows>['rows'][number]) {
  return {
    week_id: weekId,
    upload_file_id: uploadFileId,
    origin_code: row.originCode,
    origin_name: row.originName,
    dest_code: row.destCode,
    dest_name: row.destName,
    transfer_date: row.transferDate,
    sku_code: row.skuCode,
    sku_name: row.skuName,
    weight_kg: row.weightKg,
    product_group: row.productGroup,
    raw: row.raw,
  };
}

/**
 * The ABS0000 file already in this week whose rows the new file almost
 * entirely repeats (see lib/duplicateUpload.ts), with its filename — or null.
 * Runs after a same-named file has already been removed, so a deliberate
 * same-name replace never trips it.
 */
async function findDuplicateActualFile(
  weekId: string,
  rows: ReturnType<typeof validateActualRows>['rows'],
): Promise<{ filename: string; ratio: number } | null> {
  const existing = await fetchAllRows<{
    upload_file_id: string | null;
    transfer_date: string;
    origin_code: string;
    dest_code: string;
    sku_code: string;
    weight_kg: number;
  }>((from, to) =>
    supabase
      .from('actual_rows')
      .select('upload_file_id,transfer_date,origin_code,dest_code,sku_code,weight_kg')
      .eq('week_id', weekId)
      .range(from, to),
  );
  const byFile = new Map<string, string[]>();
  for (const r of existing) {
    const fileId = r.upload_file_id ?? '';
    const list = byFile.get(fileId);
    if (list) list.push(actualRowFingerprint(r));
    else byFile.set(fileId, [actualRowFingerprint(r)]);
  }
  const incoming = rows.map((r) =>
    actualRowFingerprint({
      transfer_date: r.transferDate,
      origin_code: r.originCode,
      dest_code: r.destCode,
      sku_code: r.skuCode,
      weight_kg: r.weightKg,
    }),
  );
  const duplicate = findDuplicateFile(incoming, byFile);
  if (!duplicate) return null;
  const { data } = await supabase.from('upload_files').select('original_filename').eq('id', duplicate.fileId).maybeSingle();
  return { filename: data?.original_filename ?? 'ไฟล์เดิม', ratio: duplicate.ratio };
}

/**
 * BDR130 files already in this Week that cover any of the new file's plan
 * dates, as "filename (dates)" — each date's daily plan must come from
 * exactly one file, or it's counted twice.
 */
async function describeOverlappingPlanFiles(weekId: string, dates: string[]): Promise<string[]> {
  const existing = await fetchAllRows<{ upload_file_id: string | null; production_date: string }>((from, to) =>
    supabase
      .from('plan_rows')
      .select('upload_file_id,production_date')
      .eq('week_id', weekId)
      .eq('source_file', 'daily')
      .range(from, to),
  );
  const byFile = new Map<string, Set<string>>();
  for (const r of existing) {
    const key = r.upload_file_id ?? '';
    const set = byFile.get(key) ?? new Set<string>();
    set.add(r.production_date);
    byFile.set(key, set);
  }
  const overlaps = findOverlappingDates(dates, byFile);
  if (overlaps.size === 0) return [];
  const { data: files } = await supabase.from('upload_files').select('id, original_filename').in('id', Array.from(overlaps.keys()));
  const nameById = new Map((files ?? []).map((f) => [f.id, f.original_filename]));
  return Array.from(overlaps.entries()).map(
    ([id, shared]) => `"${nameById.get(id) ?? 'ไฟล์เดิม'}" (วันที่ ${shared.map(formatDayMonth).join(', ')})`,
  );
}

/** mas_sku_representative.product_code -> plan19, paginated (thousands of rows real-world). Rows with no plan19 can't resolve a product group, so they're left out rather than mapped to null. */
async function fetchSkuRepresentativeMap(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ product_code: string; plan19: string | null }>((from, to) =>
    supabase.from('mas_sku_representative').select('product_code,plan19').range(from, to),
  );
  return new Map(rows.filter((r) => r.plan19).map((r) => [r.product_code, r.plan19!]));
}

/** mas_products.product_code -> plan19, paginated (thousands of rows real-world). Rows with no plan19 can't resolve a product group, so they're left out rather than mapped to null. */
async function fetchProductMap(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ product_code: string; plan19: string | null }>((from, to) =>
    supabase.from('mas_products').select('product_code,plan19').range(from, to),
  );
  return new Map(rows.filter((r) => r.plan19).map((r) => [r.product_code, r.plan19!]));
}

/**
 * Uploads one file into a category that allows several files per week
 * (Supply Daily / ราคารายวัน / Bidding / BDR130 Daily plan / ABS0000 โอนจริง —
 * see migrations 0012/0013/0018). Re-uploading a file with the same name replaces just that
 * file: its previous upload_files row (and, via FK cascade, every row it
 * contributed) is deleted first, then a fresh row + fresh data rows are
 * inserted — other files already in the same category are untouched,
 * unlike the single-file category (BSR030 Weekly) which replaces
 * the whole slot on every upload.
 */
/**
 * Note: this deliberately does NOT auto-trigger process-week on its own —
 * callers upload several files in one batch (see MultiFileUploadZone), and
 * recomputing supply_daily_results after every single file in that batch
 * would be wasteful. Call useProcessWeek once after the whole batch finishes.
 */
export function useMultiFileUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekId, fileType, file }: UploadMultiFileArgs): Promise<UploadMultiFileOutcome> => {
      // Replacing a same-named file starts by removing its old row (and,
      // via FK cascade, its old data rows) so the fresh insert below can't
      // collide with the unique(week_id, file_type, original_filename)
      // constraint and never leaves stale rows behind on a failed re-upload.
      const { data: existing } = await supabase
        .from('upload_files')
        .select('id, storage_path')
        .eq('week_id', weekId)
        .eq('file_type', fileType)
        .eq('original_filename', file.name)
        .maybeSingle();
      if (existing) {
        if (existing.storage_path) {
          await supabase.storage.from('transfer-uploads').remove([existing.storage_path]);
        }
        await supabase.from('upload_files').delete().eq('id', existing.id);
      }

      async function recordError(errors: UploadErrorEntry[]): Promise<UploadMultiFileOutcome> {
        await supabase.from('upload_files').insert({
          week_id: weekId,
          file_type: fileType,
          original_filename: file.name,
          file_size: file.size,
          status: 'error',
          row_count: 0,
          skipped_count: 0,
          error_report: errors,
        });
        return { status: 'error', rowCount: 0, skippedCount: 0, errors };
      }

      const { headers, rows: rawRows } = await readWorkbookFirstSheet(file);
      const missing = missingColumns(headers, REQUIRED_COLUMNS[fileType]);
      if (missing.length > 0) {
        return recordError([{ rowNumber: 1, reason: `ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missing.join(', ')}` }]);
      }

      const table = TABLE[fileType];
      let dbRowsWithoutFileId: { toDb: (uploadFileId: string) => Record<string, unknown> }[];
      let rowCount: number;
      let skippedCount: number;

      if (fileType === 'supply_daily_bsd010') {
        const { rows, errors, skippedCount: skipped } = validateSupplyDailyRows(rawRows);
        if (errors.length > 0) return recordError(errors);
        dbRowsWithoutFileId = rows.map((r) => ({ toDb: (id: string) => supplyDailyRowToDb(weekId, id, r) }));
        rowCount = rows.length;
        skippedCount = skipped;
      } else if (fileType === 'pricing_daily') {
        const priceDate = parsePricingFilenameDate(file.name);
        if (!priceDate) {
          return recordError([
            { rowNumber: 1, reason: 'อ่านวันที่จากชื่อไฟล์ไม่ได้ — ชื่อไฟล์ต้องมีรูปแบบ DD.MM.YYYY เช่น ChickenW2_26.08.2026.xlsx' },
          ]);
        }
        const productGroupByCode = await fetchSkuRepresentativeMap();
        const { rows, errors, skippedCount: skipped } = validatePricingRows(rawRows, priceDate, productGroupByCode);
        if (errors.length > 0) return recordError(errors);
        dbRowsWithoutFileId = rows.map((r) => ({ toDb: (id: string) => pricingRowToDb(weekId, id, r) }));
        rowCount = rows.length;
        skippedCount = skipped;
      } else if (fileType === 'bidding_tc05') {
        const productGroupByCode = await fetchProductMap();
        const { rows, errors, skippedCount: skipped } = validateBiddingRows(rawRows, productGroupByCode);
        if (errors.length > 0) return recordError(errors);
        dbRowsWithoutFileId = rows.map((r) => ({ toDb: (id: string) => biddingRowToDb(weekId, id, r) }));
        rowCount = rows.length;
        skippedCount = skipped;
      } else if (fileType === 'actual_abs0000') {
        const { rows: parsedRows, errors, skippedCount: parsedSkipped } = validateActualRows(rawRows);
        if (errors.length > 0) return recordError(errors);
        // A transfer outside the selected Week (± 1 day) can never match its
        // plan; a file that's mostly outside it is the wrong Week entirely.
        const week = await fetchWeekRange(weekId);
        const dateCheck = checkDatesInWeek(parsedRows.map((r) => r.transferDate), week.range);
        if (dateCheck.looksLikeOtherWeek) {
          return recordError([{ rowNumber: 1, reason: describeWeekMismatch(dateCheck, week.label, week.range) }]);
        }
        const outside = new Set(dateCheck.outsideDates);
        const rows = parsedRows.filter((r) => !outside.has(r.transferDate));
        const skipped = parsedSkipped + (parsedRows.length - rows.length);
        const duplicate = await findDuplicateActualFile(weekId, rows);
        if (duplicate) {
          return recordError([
            {
              rowNumber: 1,
              reason: `ข้อมูลในไฟล์นี้ซ้ำกับไฟล์ "${duplicate.filename}" ที่อัปโหลดไว้แล้ว ${(duplicate.ratio * 100).toFixed(0)}% — ถ้าต้องการแทนที่ไฟล์เดิม ให้ลบไฟล์เดิมก่อนแล้วอัปโหลดใหม่ (ป้องกันโอนจริงถูกนับซ้ำ)`,
            },
          ]);
        }
        dbRowsWithoutFileId = rows.map((r) => ({ toDb: (id: string) => actualRowToDb(weekId, id, r) }));
        rowCount = rows.length;
        skippedCount = skipped;
      } else {
        const { rows, errors, skippedCount: skipped } = validatePlanRows(rawRows, 'daily');
        if (errors.length > 0) return recordError(errors);
        const week = await fetchWeekRange(weekId);
        const dateCheck = checkDatesInWeek(rows.map((r) => r.productionDate), week.range);
        if (dateCheck.outsideRowCount > 0) {
          return recordError([{ rowNumber: 1, reason: describeWeekMismatch(dateCheck, week.label, week.range) }]);
        }
        const overlapping = await describeOverlappingPlanFiles(weekId, rows.map((r) => r.productionDate));
        if (overlapping.length > 0) {
          return recordError([
            {
              rowNumber: 1,
              reason: `แผน Daily ของวันเดียวกันมีอยู่แล้วในไฟล์ ${overlapping.join(', ')} — ถ้าไฟล์นี้เป็นแผนฉบับใหม่ ให้ลบไฟล์เดิมก่อนแล้วอัปโหลดใหม่ (ป้องกันแผนถูกนับซ้ำ)`,
            },
          ]);
        }
        dbRowsWithoutFileId = rows.map((r) => ({ toDb: (id: string) => planDailyRowToDb(weekId, id, r) }));
        rowCount = rows.length;
        skippedCount = skipped;
      }

      const storagePath = `${weekId}/${fileType}/${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage.from('transfer-uploads').upload(storagePath, file, {
        upsert: true,
      });
      if (storageError) throw storageError;

      const { data: inserted, error: insertUploadFileError } = await supabase
        .from('upload_files')
        .insert({
          week_id: weekId,
          file_type: fileType,
          original_filename: file.name,
          file_size: file.size,
          storage_path: storagePath,
          status: 'validated',
          row_count: rowCount,
          skipped_count: skippedCount,
          error_report: null,
        })
        .select('id')
        .single();
      if (insertUploadFileError) throw insertUploadFileError;

      const dbRows = dbRowsWithoutFileId.map((r) => r.toDb(inserted.id));
      try {
        await insertInBatches(table, dbRows);
      } catch (err) {
        // Don't leave a half-inserted file behind (it would be counted as if
        // complete): removing its upload_files row cascades to the rows that
        // did make it in.
        await supabase.from('upload_files').delete().eq('id', inserted.id);
        await supabase.storage.from('transfer-uploads').remove([storagePath]);
        throw err;
      }

      return { status: 'validated', rowCount, skippedCount, errors: [] };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: weekUploadFilesQueryKey(variables.weekId) });
      queryClient.invalidateQueries({ queryKey: LATEST_UPLOAD_STAMPS_QUERY_KEY });
    },
  });
}
