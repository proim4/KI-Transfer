import { Fragment, useMemo, useState } from 'react';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { formatBaht, formatKg, formatPct } from './KpiCard';
import ResizableTh from './ResizableTh';
import RemarkCell from './RemarkCell';
import RouteFilterBar, {
  EMPTY_ROUTE_FILTER,
  matchesRouteFilter,
  routeFilterOptions,
  type RouteFilterValue,
} from './RouteFilterBar';
import StatusBadge from './StatusBadge';
import type { TrackingResultRow } from '../types/db';

interface DrilldownTableProps {
  weekId: string;
  rows: TrackingResultRow[];
}

type SortKey =
  | 'production_date'
  | 'status'
  | 'origin_name'
  | 'dest_name'
  | 'product_group'
  | 'plan_total'
  | 'actual_total'
  | 'total_pct'
  | 'overage'
  | 'profit_lost'
  | 'remark';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align?: 'right'; pin?: boolean }[] = [
  { key: 'production_date', label: 'วันที่', pin: true },
  { key: 'status', label: 'สถานะ' },
  { key: 'origin_name', label: 'ต้นทาง' },
  { key: 'dest_name', label: 'ปลายทาง' },
  { key: 'product_group', label: 'กลุ่มสินค้า' },
  { key: 'plan_total', label: 'แผน (kg)', align: 'right' },
  { key: 'actual_total', label: 'จริง (kg)', align: 'right' },
  { key: 'total_pct', label: '% เทียบแผน', align: 'right' },
  { key: 'overage', label: 'โอนเกินแผน', align: 'right' },
  { key: 'profit_lost', label: 'สูญเสีย (บาท)', align: 'right' },
  { key: 'remark', label: 'หมายเหตุ' },
];

function sortValue(row: TrackingResultRow, key: SortKey): string | number | null {
  return key === 'status' ? row.total_pct : row[key];
}

const PIN_CLASS = 'sticky left-0 z-10 bg-white';
const PIN_HEADER_CLASS = 'sticky left-0 z-20 bg-gray-50';

function compareValues(a: string | number | null, b: string | number | null): number {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a ?? '').localeCompare(String(b ?? ''));
  }
  // Nulls (e.g. total_pct with a zero plan, displayed as "-") sort last in
  // ascending order, first in descending — never silently dropped.
  const an = a === null ? -Infinity : a;
  const bn = b === null ? -Infinity : b;
  return an - bn;
}

function pickRoute(r: TrackingResultRow) {
  return {
    date: r.production_date,
    origin: r.origin_name,
    dest: r.dest_name,
    productGroup: r.product_group,
    searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group}`,
  };
}

export default function DrilldownTable({ weekId, rows }: DrilldownTableProps) {
  const thresholds = useStatusThresholds();
  const [filter, setFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('production_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const initialWidths = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, defaultColumnWidth(c.label)])),
    [],
  );
  const { widths, startResize } = useColumnWidths(initialWidths);
  const totalWidth = COLUMNS.reduce((a, c) => a + (widths[c.key] ?? defaultColumnWidth(c.label)), 0);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  const options = useMemo(() => routeFilterOptions(rows, pickRoute), [rows]);
  const filtered = rows.filter((r) => matchesRouteFilter(filter, pickRoute(r)));

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = compareValues(sortValue(a, sortKey), sortValue(b, sortKey));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const expandedRow = sorted.find((r) => r.id === expandedId) ?? null;
  const breakdown = useActualBreakdown(weekId, expandedRow);

  return (
    <div>
      <RouteFilterBar value={filter} onChange={setFilter} options={options} resultCount={filtered.length} />

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200">
        <table className="text-left text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? defaultColumnWidth(c.label) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {COLUMNS.map((c) => (
                <ResizableTh
                  key={c.key}
                  width={widths[c.key] ?? defaultColumnWidth(c.label)}
                  align={c.align}
                  onClick={() => handleSort(c.key)}
                  onMouseDownResize={startResize(c.key)}
                  className={c.pin ? PIN_HEADER_CLASS : ''}
                >
                  {c.label}
                  <span className={c.key === sortKey ? 'text-gray-600' : 'text-gray-300'}>
                    {c.key === sortKey ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 ${PIN_CLASS}`}>
                    {r.production_date}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2">
                    {thresholds && <StatusBadge pct={r.total_pct} thresholds={thresholds} />}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2">{r.origin_name}</td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2">{r.dest_name}</td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2">{r.product_group}</td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right">
                    {formatKg(r.plan_total)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right">
                    {formatKg(r.actual_total)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right font-medium">
                    {formatPct(r.total_pct)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right">
                    {formatKg(r.overage)}
                  </td>
                  <td
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right ${
                      r.profit_lost < 0 ? 'text-red-600' : ''
                    }`}
                  >
                    {formatBaht(r.profit_lost)}
                  </td>
                  <td className="px-1 py-1">
                    <RemarkCell id={r.id} value={r.remark} />
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={COLUMNS.length} className="px-3 py-3">
                      <p className="mb-2 text-xs font-medium uppercase text-gray-500">
                        รายละเอียด SKU ที่โอนจริงในกลุ่มนี้
                      </p>
                      {breakdown.isLoading && <p className="text-xs text-gray-400">กำลังโหลด...</p>}
                      {breakdown.data && breakdown.data.length === 0 && (
                        <p className="text-xs text-gray-400">ไม่มีการโอนจริงในกลุ่มนี้</p>
                      )}
                      {breakdown.data && breakdown.data.length > 0 && (
                        <table className="w-full max-w-xl text-xs">
                          <thead className="text-gray-500">
                            <tr>
                              <th className="py-1 text-left">รหัสสินค้า</th>
                              <th className="py-1 text-left">ชื่อสินค้า</th>
                              <th className="py-1 text-right">น้ำหนัก (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {breakdown.data.map((sku) => (
                              <tr key={sku.id} className="border-t border-gray-200">
                                <td className="py-1">{sku.sku_code}</td>
                                <td className="py-1">{sku.sku_name}</td>
                                <td className="py-1 text-right">{formatKg(sku.weight_kg)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
