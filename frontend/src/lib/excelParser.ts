import * as XLSX from 'xlsx';
import type { UploadErrorEntry } from '../types/db';
import type { ActualRow, BiddingRow, PlanRow, PricingRow, SourceFile, SupplyDailyRow } from '../types/tracking';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
}

/** Reads the first sheet of an uploaded .xls/.xlsx file into header-keyed row objects. */
export async function readWorkbookFirstSheet(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  const headerRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0 });
  const headers = (headerRows[0] ?? []).map((h) => String(h));
  return { headers, rows };
}

function excelSerialToIsoDate(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  const y = String(parsed.y).padStart(4, '0');
  const m = String(parsed.m).padStart(2, '0');
  const d = String(parsed.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Accepts a JS Date (from SheetJS's cellDates conversion), a raw Excel date
 * serial number, or a "DD/MM/YYYY" / "YYYY-MM-DD" text date — the plan files
 * store dates as Gregorian "DD/MM/YYYY" text, the ABS0000 file stores real
 * date serials. Returns 'YYYY-MM-DD' or null if unparseable.
 */
export function parseFlexibleDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    return excelSerialToIsoDate(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * The daily pricing export carries no date column at all — the manual sheet
 * requires the filename format `ChickenW2_DD.MM.YYYY.xlsx` (or
 * `Chicken_DD.MM.YYYY`), so the date has to be parsed from the filename
 * itself. Returns 'YYYY-MM-DD' or null if the filename doesn't contain a
 * DD.MM.YYYY pattern.
 */
export function parsePricingFilenameDate(filename: string): string | null {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(filename);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Product/SKU codes appear in two different shapes across these exports: the
 * master-data sheets (Mas P19 Cus, Mas sku ตัวแทน) store them as bare numbers
 * (e.g. `23056283`), while the Bidding/ABS0000 exports store the same code as
 * an 18-digit zero-padded text string (e.g. `"000000000023056283"`, a SAP
 * material-code convention). Strips leading zeros so both shapes join
 * correctly against the master-data maps.
 */
export function normalizeProductCode(code: string): string {
  const stripped = code.replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '');
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number') return String(value);
  return null;
}

// Only the columns this app actually reads are required — extra/reordered
// upstream columns are tolerated so a minor Smart Sales export change
// doesn't break uploads outright.
export const PLAN_REQUIRED_COLUMNS = [
  'productionDate',
  'รหัสโรงงานต้นทาง',
  'โรงงานต้นทาง',
  'รหัสโรงงานปลายทาง',
  'โรงงานปลายทาง',
  'productForPlan19',
  'suggest',
  'supplyAfter',
  'ราคาต้นทาง',
  'ราคาปลายทาง',
] as const;

export const ACTUAL_REQUIRED_COLUMNS = [
  'รหัสโรงงานต้นทาง',
  'ชื่อโรงงานต้นทาง',
  'รหัสโรงงานปลายทาง',
  'ชื่อโรงงานปลายทาง',
  'วันที่โอน',
  'รหัสสินค้า',
  'ชื่อสินค้า',
  'น้ำหนักสินค้า (KG)',
  'P19',
] as const;

// BSD010 "Actual Balance Supply Daily" export has 34 columns; only the ones
// the Supply Daily checks actually read are required here.
export const SUPPLY_DAILY_REQUIRED_COLUMNS = [
  'วันที่โอน',
  'รหัสโรงงาน',
  'โรงงาน',
  'กลุ่มชิ้นส่วน',
  'กลุ่มชิ้นส่วน(Custom)',
  'Rev. ปริมาณของเหลือ',
] as const;

// Daily pricing export (ChickenW2_DD.MM.YYYY.xlsx) has 26 columns; the date
// itself comes from the *filename*, not a column (see parsePricingFilenameDate).
export const PRICING_REQUIRED_COLUMNS = ['VendorGroup', 'ProductCode', 'CostZ', 'Margin'] as const;

// TC05 "Actual allocation" (Bidding) export.
export const BIDDING_REQUIRED_COLUMNS = ['Sales date', 'Plant code', 'Product code', 'Allocate sp type'] as const;

export function missingColumns(headers: string[], required: readonly string[]): string[] {
  const headerSet = new Set(headers);
  return required.filter((c) => !headerSet.has(c));
}

export interface ValidationResult<T> {
  rows: T[];
  errors: UploadErrorEntry[];
  /** Rows that are legitimately out of scope (not malformed) and were left out silently. */
  skippedCount: number;
}

export function validatePlanRows(rows: Record<string, unknown>[], sourceFile: SourceFile): ValidationResult<PlanRow> {
  const result: PlanRow[] = [];
  const errors: UploadErrorEntry[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1, data starts at row 2
    const productionDate = parseFlexibleDate(raw['productionDate']);
    const originCode = nonEmptyString(raw['รหัสโรงงานต้นทาง']);
    const destCode = nonEmptyString(raw['รหัสโรงงานปลายทาง']);
    const productGroup = nonEmptyString(raw['productForPlan19']);
    const suggest = parseNumber(raw['suggest']);
    const supplyAfter = parseNumber(raw['supplyAfter']);
    // Origin/dest price is sometimes genuinely blank for a route (real data,
    // seen in WK36) — the original workbook's own profit/loss formulas treat
    // a blank price as 0 via IFERROR rather than rejecting the row, since
    // price only feeds Baht profit/loss, never the qty/% tracking itself.
    const originPrice = parseNumber(raw['ราคาต้นทาง']) ?? 0;
    const destPrice = parseNumber(raw['ราคาปลายทาง']) ?? 0;

    const problems: string[] = [];
    if (!productionDate) problems.push('วันที่ผลิต/โอน (productionDate) อ่านไม่ได้');
    if (!originCode) problems.push('รหัสโรงงานต้นทางว่างเปล่า');
    if (!destCode) problems.push('รหัสโรงงานปลายทางว่างเปล่า');
    if (!productGroup) problems.push('กลุ่มสินค้า (productForPlan19) ว่างเปล่า');
    if (suggest === null) problems.push('suggest ไม่ใช่ตัวเลข');
    if (supplyAfter === null) problems.push('supplyAfter ไม่ใช่ตัวเลข');

    if (problems.length > 0) {
      errors.push({ rowNumber, reason: problems.join('; ') });
      return;
    }

    result.push({
      sourceFile,
      productionDate: productionDate!,
      originCode: originCode!,
      originName: nonEmptyString(raw['โรงงานต้นทาง']) ?? originCode!,
      destCode: destCode!,
      destName: nonEmptyString(raw['โรงงานปลายทาง']) ?? destCode!,
      productGroup: productGroup!,
      originPrice,
      destPrice,
      suggest: suggest!,
      supplyAfter: supplyAfter!,
      raw,
    });
  });

  return { rows: result, errors, skippedCount: 0 };
}

export function validateActualRows(rows: Record<string, unknown>[]): ValidationResult<ActualRow> {
  const result: ActualRow[] = [];
  const errors: UploadErrorEntry[] = [];
  let skippedCount = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const transferDate = parseFlexibleDate(raw['วันที่โอน']);
    const originCode = nonEmptyString(raw['รหัสโรงงานต้นทาง']);
    const destCode = nonEmptyString(raw['รหัสโรงงานปลายทาง']);
    const skuCode = nonEmptyString(raw['รหัสสินค้า']);
    const productGroup = nonEmptyString(raw['P19']);
    const weightKg = parseNumber(raw['น้ำหนักสินค้า (KG)']);

    // A blank destination factory means this is a direct-to-customer
    // shipment, not a factory-to-factory transfer — real ~25% of WK36's
    // ABS0000 rows. It can never match any plan row (plans always name a
    // real destination factory), so the original workbook's own SUMIFS
    // silently never counts it either. Out of scope, not malformed: skip
    // without reporting it as an error the user needs to "fix".
    if (!destCode) {
      skippedCount += 1;
      return;
    }

    const problems: string[] = [];
    if (!transferDate) problems.push('วันที่โอนอ่านไม่ได้');
    if (!originCode) problems.push('รหัสโรงงานต้นทางว่างเปล่า');
    if (!skuCode) problems.push('รหัสสินค้าว่างเปล่า');
    if (!productGroup) problems.push('กลุ่มสินค้า (P19) ว่างเปล่า');
    if (weightKg === null || weightKg < 0) problems.push('น้ำหนักสินค้า (KG) ไม่ใช่ตัวเลขที่ถูกต้อง');

    if (problems.length > 0) {
      errors.push({ rowNumber, reason: problems.join('; ') });
      return;
    }

    result.push({
      originCode: originCode!,
      originName: nonEmptyString(raw['ชื่อโรงงานต้นทาง']) ?? originCode!,
      destCode: destCode!,
      destName: nonEmptyString(raw['ชื่อโรงงานปลายทาง']) ?? destCode!,
      transferDate: transferDate!,
      skuCode: skuCode!,
      skuName: nonEmptyString(raw['ชื่อสินค้า']) ?? skuCode!,
      weightKg: weightKg!,
      productGroup: productGroup!,
      raw,
    });
  });

  return { rows: result, errors, skippedCount };
}

export function validateSupplyDailyRows(rows: Record<string, unknown>[]): ValidationResult<SupplyDailyRow> {
  const result: SupplyDailyRow[] = [];
  const errors: UploadErrorEntry[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const productionDate = parseFlexibleDate(raw['วันที่โอน']);
    const originCode = nonEmptyString(raw['รหัสโรงงาน']);
    const productGroup = nonEmptyString(raw['กลุ่มชิ้นส่วน']);
    const remainingQty = parseNumber(raw['Rev. ปริมาณของเหลือ']);

    const problems: string[] = [];
    if (!productionDate) problems.push('วันที่โอนอ่านไม่ได้');
    if (!originCode) problems.push('รหัสโรงงานว่างเปล่า');
    if (!productGroup) problems.push('กลุ่มชิ้นส่วนว่างเปล่า');
    if (remainingQty === null) problems.push('Rev. ปริมาณของเหลือ ไม่ใช่ตัวเลข');

    if (problems.length > 0) {
      errors.push({ rowNumber, reason: problems.join('; ') });
      return;
    }

    result.push({
      productionDate: productionDate!,
      originCode: originCode!,
      originName: nonEmptyString(raw['โรงงาน']) ?? originCode!,
      productGroup: productGroup!,
      productGroupCustom: nonEmptyString(raw['กลุ่มชิ้นส่วน(Custom)']) ?? '',
      remainingQty: remainingQty!,
      raw,
    });
  });

  return { rows: result, errors, skippedCount: 0 };
}

/**
 * @param priceDate parsed once from the filename by the caller (see
 * parsePricingFilenameDate) — the file itself carries no date column.
 * @param productGroupByCode SKU code -> P19 group, resolved from
 * mas_sku_representative (fetched by the caller before validating).
 */
export function validatePricingRows(
  rows: Record<string, unknown>[],
  priceDate: string,
  productGroupByCode: Map<string, string>,
): ValidationResult<PricingRow> {
  const result: PricingRow[] = [];
  const errors: UploadErrorEntry[] = [];
  let skippedCount = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const vendorGroup = nonEmptyString(raw['VendorGroup']);
    const productCode = nonEmptyString(raw['ProductCode']);
    const costZ = parseNumber(raw['CostZ']);
    const margin = parseNumber(raw['Margin']);

    // A SKU not in mas_sku_representative can't be resolved to a P19 group —
    // it simply never feeds the "check ลงราคา" comparison, same as an
    // unresolvable SKU silently contributes nothing in the source workbook's
    // own VLOOKUP-based join.
    const productGroup = productCode ? productGroupByCode.get(normalizeProductCode(productCode)) : undefined;
    if (!productGroup) {
      skippedCount += 1;
      return;
    }

    const problems: string[] = [];
    if (!vendorGroup) problems.push('VendorGroup ว่างเปล่า');
    if (costZ === null) problems.push('CostZ ไม่ใช่ตัวเลข');
    if (margin === null) problems.push('Margin ไม่ใช่ตัวเลข');

    if (problems.length > 0) {
      errors.push({ rowNumber, reason: problems.join('; ') });
      return;
    }

    result.push({
      priceDate,
      vendorGroup: vendorGroup!,
      productGroup,
      costZ: costZ!,
      margin: margin!,
      netPrice: costZ! + margin!,
      raw,
    });
  });

  return { rows: result, errors, skippedCount };
}

/**
 * @param productGroupByCode Product code -> P19 group, resolved from
 * mas_products (fetched by the caller before validating).
 */
export function validateBiddingRows(
  rows: Record<string, unknown>[],
  productGroupByCode: Map<string, string>,
): ValidationResult<BiddingRow> {
  const result: BiddingRow[] = [];
  const errors: UploadErrorEntry[] = [];
  let skippedCount = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const salesDate = parseFlexibleDate(raw['Sales date']);
    const plantCode = nonEmptyString(raw['Plant code']);
    const productCode = nonEmptyString(raw['Product code']);
    const allocateSpType = nonEmptyString(raw['Allocate sp type']) ?? '';

    // Same silent-skip rationale as pricing rows: an unresolvable product
    // code contributes nothing to any check, same as the workbook's own
    // VLOOKUP against Mas P19 Cus.
    const productGroup = productCode ? productGroupByCode.get(normalizeProductCode(productCode)) : undefined;
    if (!productGroup) {
      skippedCount += 1;
      return;
    }

    const problems: string[] = [];
    if (!salesDate) problems.push('Sales date อ่านไม่ได้');
    if (!plantCode) problems.push('Plant code ว่างเปล่า');

    if (problems.length > 0) {
      errors.push({ rowNumber, reason: problems.join('; ') });
      return;
    }

    result.push({
      salesDate: salesDate!,
      plantCode: plantCode!,
      productGroup,
      allocateSpType,
      isLowBid: allocateSpType === 'PICKUP_LOW_BIDDING',
      raw,
    });
  });

  return { rows: result, errors, skippedCount };
}
