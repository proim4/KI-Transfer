import type { ColumnGroup } from '../components/SortableTable';

/**
 * Shared column-group palette for the Tracking tables, matching the source
 * workbook's PivotTable header exactly: each group band shows two stacked
 * lines (bandTop/bandBottom) instead of one. Diff and % are now separate
 * groups (previously merged) since the reference shows them as two distinct
 * "ABS0000" bands, not one "ผลต่าง" band.
 *
 * labelClassName (row 3, column names) reuses the same solid color as
 * bandClassName (row 1) per earlier feedback that a pastel tint looked
 * washed out. totalsTintClassName (row 2, the grand-total row) stays a
 * light tint on purpose — its own text is colored (black/green/red) and
 * needs a light background to stay legible.
 */
export const ROUTE_GROUP: ColumnGroup = {
  key: 'route',
  bandBottom: 'ข้อมูลเส้นทาง',
  bandClassName: 'bg-gray-100 text-gray-700',
  labelClassName: 'bg-gray-100 text-gray-700',
  totalsTintClassName: 'bg-gray-50',
};

export const PLAN_GROUP: ColumnGroup = {
  key: 'plan',
  bandTop: 'BDR130',
  bandBottom: 'แผนโอนทั้งหมด',
  bandClassName: 'bg-amber-500 text-amber-950',
  labelClassName: 'bg-amber-500 text-amber-950',
  totalsTintClassName: 'bg-amber-50',
};

export const ACTUAL_GROUP: ColumnGroup = {
  key: 'actual',
  bandTop: 'ABS0000',
  bandBottom: 'โอนจริงทั้งหมด',
  bandClassName: 'bg-green-800 text-white',
  labelClassName: 'bg-green-800 text-white',
  totalsTintClassName: 'bg-green-50',
  dark: true,
};

export const DIFF_GROUP: ColumnGroup = {
  key: 'diff',
  bandTop: 'ABS0000',
  bandBottom: 'Diff แผนโอน',
  bandClassName: 'bg-green-700 text-white',
  labelClassName: 'bg-green-700 text-white',
  totalsTintClassName: 'bg-gray-50',
  dark: true,
};

export const PCT_GROUP: ColumnGroup = {
  key: 'pct',
  bandTop: 'ABS0000',
  bandBottom: '%โอนเทียบแผน',
  bandClassName: 'bg-green-700 text-white',
  labelClassName: 'bg-green-700 text-white',
  totalsTintClassName: 'bg-gray-50',
  dark: true,
};

export const PROFIT_GROUP: ColumnGroup = {
  key: 'profit',
  bandTop: 'กำไรที่ได้',
  bandBottom: 'จากส่วนต่างราคา',
  bandClassName: 'bg-green-900 text-white',
  labelClassName: 'bg-green-900 text-white',
  totalsTintClassName: 'bg-green-50',
  dark: true,
};

export const LOSS_GROUP: ColumnGroup = {
  key: 'loss',
  bandTop: 'สูญเสียกำไร',
  bandBottom: 'จากส่วนต่างราคา',
  bandClassName: 'bg-red-600 text-white',
  labelClassName: 'bg-red-600 text-white',
  totalsTintClassName: 'bg-red-50',
  dark: true,
};

export const REMARK_GROUP: ColumnGroup = {
  key: 'remark',
  bandBottom: 'หมายเหตุ',
  bandClassName: 'bg-navy-700 text-white',
  labelClassName: 'bg-navy-700 text-white',
  totalsTintClassName: 'bg-navy-50',
  dark: true,
};
