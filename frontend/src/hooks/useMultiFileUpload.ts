import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BIDDING_REQUIRED_COLUMNS,
  PLAN_REQUIRED_COLUMNS,
  PRICING_REQUIRED_COLUMNS,
  SUPPLY_DAILY_REQUIRED_COLUMNS,
  missingColumns,
  parsePricingFilenameDate,
  readWorkbookFirstSheet,
  validateBiddingRows,
  validatePlanRows,
  validatePricingRows,
  validateSupplyDailyRows,
} from '../lib/excelParser';
import { fetchAllRows } from '../lib/fetchAllRows';
import { insertInBatches } from '../lib/insertInBatches';
import { supabase } from '../lib/supabase';
import type { MultiFileUploadType, UploadErrorEntry } from '../types/db';
import { uploadFilesQueryKey } from './useUploadFiles';

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
};

const TABLE: Record<MultiFileUploadType, string> = {
  supply_daily_bsd010: 'supply_daily_rows',
  pricing_daily: 'pricing_rows',
  bidding_tc05: 'bidding_rows',
  plan_daily_bdr130: 'plan_rows',
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
 * (Supply Daily / ราคารายวัน / Bidding / BDR130 Daily plan — see migrations
 * 0012/0013). Re-uploading a file with the same name replaces just that
 * file: its previous upload_files row (and, via FK cascade, every row it
 * contributed) is deleted first, then a fresh row + fresh data rows are
 * inserted — other files already in the same category are untouched,
 * unlike the single-file categories (ABS0000/BSR030 Weekly) which replace
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
      } else {
        const { rows, errors, skippedCount: skipped } = validatePlanRows(rawRows, 'daily');
        if (errors.length > 0) return recordError(errors);
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
      await insertInBatches(table, dbRows);

      return { status: 'validated', rowCount, skippedCount, errors: [] };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: uploadFilesQueryKey(variables.weekId, variables.fileType) });
    },
  });
}
