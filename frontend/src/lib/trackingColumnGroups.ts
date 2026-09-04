import type { ColumnGroup } from '../components/SortableTable';

/** Shared column-group palette for the Tracking tables — see the design note in DrilldownTable.tsx/TrackingChannel.tsx for why each color was chosen. */
export const ROUTE_GROUP: ColumnGroup = {
  key: 'route',
  label: 'ข้อมูลเส้นทาง',
  bandClassName: 'bg-amber-500 text-amber-950',
  tintClassName: 'bg-amber-50',
};

export const PLAN_GROUP: ColumnGroup = {
  key: 'plan',
  label: 'แผนโอน',
  bandClassName: 'bg-green-600 text-white',
  tintClassName: 'bg-green-50',
};

export const ACTUAL_GROUP: ColumnGroup = {
  key: 'actual',
  label: 'โอนจริง',
  bandClassName: 'bg-slate-700 text-white',
  tintClassName: 'bg-slate-100',
};

export const DIFF_GROUP: ColumnGroup = {
  key: 'diff',
  label: 'ผลต่าง',
  bandClassName: 'bg-slate-500 text-white',
  tintClassName: 'bg-gray-50',
};

export const PROFIT_GROUP: ColumnGroup = {
  key: 'profit',
  label: 'กำไรที่ได้',
  bandClassName: 'bg-green-700 text-white',
  tintClassName: 'bg-green-50',
};

export const LOSS_GROUP: ColumnGroup = {
  key: 'loss',
  label: 'สูญเสียกำไร',
  bandClassName: 'bg-red-600 text-white',
  tintClassName: 'bg-red-50',
};

export const REMARK_GROUP: ColumnGroup = {
  key: 'remark',
  label: 'หมายเหตุ',
  bandClassName: 'bg-navy-700 text-white',
  tintClassName: 'bg-navy-50',
};
