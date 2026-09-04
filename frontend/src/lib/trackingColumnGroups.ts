import type { ColumnGroup } from '../components/SortableTable';

/**
 * Shared column-group palette for the Tracking tables.
 *
 * Three different treatments per group, top to bottom:
 * - bandClassName: the group-name row (row 1) — solid/bold.
 * - labelClassName: the column-name row (row 3) — reuses the *same* solid
 *   color as the band (not a pastel tint) per explicit feedback that this
 *   row read as too washed-out next to the bold band above it.
 * - totalsTintClassName: the grand-total row (row 2), which sits BETWEEN
 *   the two — kept as a light tint on purpose, because the total's own text
 *   is colored (black/green/red) and would lose all contrast on a dark or
 *   saturated background.
 */
export const ROUTE_GROUP: ColumnGroup = {
  key: 'route',
  label: 'ข้อมูลเส้นทาง',
  bandClassName: 'bg-gray-100 text-gray-700',
  labelClassName: 'bg-gray-100 text-gray-700',
  totalsTintClassName: 'bg-gray-50',
};

export const PLAN_GROUP: ColumnGroup = {
  key: 'plan',
  label: 'แผนโอน',
  bandClassName: 'bg-amber-500 text-amber-950',
  labelClassName: 'bg-amber-500 text-amber-950',
  totalsTintClassName: 'bg-amber-50',
};

export const ACTUAL_GROUP: ColumnGroup = {
  key: 'actual',
  label: 'โอนจริง',
  bandClassName: 'bg-green-800 text-white',
  labelClassName: 'bg-green-800 text-white',
  totalsTintClassName: 'bg-green-50',
  dark: true,
};

export const DIFF_GROUP: ColumnGroup = {
  key: 'diff',
  label: 'ผลต่าง',
  bandClassName: 'bg-slate-500 text-white',
  labelClassName: 'bg-slate-500 text-white',
  totalsTintClassName: 'bg-gray-50',
  dark: true,
};

export const PROFIT_GROUP: ColumnGroup = {
  key: 'profit',
  label: 'กำไรที่ได้',
  bandClassName: 'bg-green-700 text-white',
  labelClassName: 'bg-green-700 text-white',
  totalsTintClassName: 'bg-green-50',
  dark: true,
};

export const LOSS_GROUP: ColumnGroup = {
  key: 'loss',
  label: 'สูญเสียกำไร',
  bandClassName: 'bg-red-600 text-white',
  labelClassName: 'bg-red-600 text-white',
  totalsTintClassName: 'bg-red-50',
  dark: true,
};

export const REMARK_GROUP: ColumnGroup = {
  key: 'remark',
  label: 'หมายเหตุ',
  bandClassName: 'bg-navy-700 text-white',
  labelClassName: 'bg-navy-700 text-white',
  totalsTintClassName: 'bg-navy-50',
  dark: true,
};
