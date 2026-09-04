import { Fragment, useMemo, useState } from 'react';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { aggregateChannel, dedupedActualTotal, sum } from '../lib/aggregate';
import { ACTUAL_GROUP, DIFF_GROUP, LOSS_GROUP, PCT_GROUP, PLAN_GROUP, REMARK_GROUP, ROUTE_GROUP } from '../lib/trackingColumnGroups';
import { formatBaht, formatKg, formatPct } from './KpiCard';
import PctBar from './PctBar';
import ResizableTh from './ResizableTh';
import RemarkCell from './RemarkCell';
import RouteFilterBar, {
  EMPTY_ROUTE_FILTER,
  matchesRouteFilter,
  routeFilterOptions,
  type RouteFilterValue,
} from './RouteFilterBar';
import { groupRuns, pinnedLeftOffsets, type ColumnGroup } from './SortableTable';
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

const COLUMNS: { key: SortKey; label: string; align?: 'right'; pin?: boolean; group: ColumnGroup }[] = [
  { key: 'production_date', label: 'วันที่', pin: true, group: ROUTE_GROUP },
  { key: 'status', label: 'สถานะ', pin: true, group: ROUTE_GROUP },
  { key: 'origin_name', label: 'ต้นทาง', pin: true, group: ROUTE_GROUP },
  { key: 'dest_name', label: 'ปลายทาง', pin: true, group: ROUTE_GROUP },
  { key: 'product_group', label: 'กลุ่มสินค้า', pin: true, group: ROUTE_GROUP },
  { key: 'plan_total', label: 'แผน (kg)', align: 'right', group: PLAN_GROUP },
  { key: 'actual_total', label: 'จริง (kg)', align: 'right', group: ACTUAL_GROUP },
  { key: 'total_pct', label: '% เทียบแผน', align: 'right', group: PCT_GROUP },
  { key: 'overage', label: 'โอนเกินแผน', align: 'right', group: DIFF_GROUP },
  { key: 'profit_lost', label: 'สูญเสีย (บาท)', align: 'right', group: LOSS_GROUP },
  { key: 'remark', label: 'หมายเหตุ', group: REMARK_GROUP },
];

const RUNS = groupRuns(COLUMNS);
const TOTAL_TONE_CLASS: Record<'good' | 'bad', string> = { good: 'text-green-700', bad: 'text-red-700' };

function sortValue(row: TrackingResultRow, key: SortKey): string | number | null {
  return key === 'status' ? row.total_pct : row[key];
}

const PIN_CLASS = 'sticky z-10 bg-[inherit]';

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
  const { widths, startResize } = useColumnWidths(initialWidths, 'columnWidths:dashboard-tracking');
  const totalWidth = COLUMNS.reduce((a, c) => a + (widths[c.key] ?? defaultColumnWidth(c.label)), 0);
  const pinnedLeft = useMemo(() => pinnedLeftOffsets(COLUMNS, widths), [widths]);

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

  // Grand totals for the currently filtered rows, shown pinned above each
  // metric's own column (like the source workbook's PivotTable grand-total
  // row) rather than in a separate strip that would drift out of alignment
  // once the table scrolls horizontally.
  const totalsByKey: Partial<Record<SortKey, { value: string; tone?: 'good' | 'bad' }>> = useMemo(() => {
    const agg = aggregateChannel(filtered, 'total');
    const lossSum = sum(filtered.map((r) => Number(r.profit_lost)));
    return {
      plan_total: { value: formatKg(agg.planSum) },
      actual_total: { value: formatKg(dedupedActualTotal(filtered)) },
      total_pct: { value: formatPct(agg.pct) },
      overage: { value: formatKg(sum(filtered.map((r) => Number(r.overage)))) },
      profit_lost: { value: formatBaht(lossSum), tone: lossSum < 0 ? 'bad' : undefined },
    };
  }, [filtered]);

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
          <thead className="text-xs uppercase text-gray-500">
            <tr className="h-14">
              {RUNS.map((run, i) => (
                <th
                  key={`${run.group.key}-${i}`}
                  colSpan={run.span}
                  style={run.pinKey !== undefined ? { left: pinnedLeft[run.pinKey] } : undefined}
                  className={`sticky top-0 overflow-hidden px-2 text-center text-[11px] font-semibold normal-case leading-tight tracking-wide ${
                    run.pin ? 'z-30' : 'z-20'
                  } ${run.group.bandClassName}`}
                >
                  {run.group.bandTop && <div className="opacity-90">{run.group.bandTop}</div>}
                  <div className="font-bold">{run.group.bandBottom}</div>
                </th>
              ))}
            </tr>
            <tr className="h-8">
              {COLUMNS.map((c) => {
                const total = totalsByKey[c.key];
                return (
                  <th
                    key={c.key}
                    style={c.pin ? { left: pinnedLeft[c.key] } : undefined}
                    className={`sticky top-14 overflow-hidden px-3 text-sm font-bold normal-case ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    } ${c.pin ? 'z-30' : 'z-10'} ${c.group.totalsTintClassName} ${
                      total?.tone ? TOTAL_TONE_CLASS[total.tone] : 'text-gray-900'
                    }`}
                  >
                    {total?.value ?? ''}
                  </th>
                );
              })}
            </tr>
            <tr className="h-9">
              {COLUMNS.map((c) => (
                <ResizableTh
                  key={c.key}
                  width={widths[c.key] ?? defaultColumnWidth(c.label)}
                  left={c.pin ? pinnedLeft[c.key] : undefined}
                  align={c.align}
                  onClick={() => handleSort(c.key)}
                  onMouseDownResize={startResize(c.key)}
                  className={`sticky top-[88px] ${c.pin ? 'z-30' : 'z-10'} ${c.group.labelClassName}`}
                >
                  {c.label}
                  <span
                    className={
                      c.key === sortKey
                        ? c.group.dark
                          ? 'text-white'
                          : 'text-gray-600'
                        : c.group.dark
                          ? 'text-white/50'
                          : 'text-gray-300'
                    }
                  >
                    {c.key === sortKey ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r, i) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className={`cursor-pointer hover:bg-blue-50 ${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <td
                    style={{ left: pinnedLeft.production_date }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${PIN_CLASS}`}
                  >
                    {r.production_date}
                  </td>
                  <td
                    style={{ left: pinnedLeft.status }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${PIN_CLASS}`}
                  >
                    {thresholds && <StatusBadge pct={r.total_pct} thresholds={thresholds} />}
                  </td>
                  <td
                    style={{ left: pinnedLeft.origin_name }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${PIN_CLASS}`}
                  >
                    {r.origin_name}
                  </td>
                  <td
                    style={{ left: pinnedLeft.dest_name }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${PIN_CLASS}`}
                  >
                    {r.dest_name}
                  </td>
                  <td
                    style={{ left: pinnedLeft.product_group }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${PIN_CLASS}`}
                  >
                    {r.product_group}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 text-right">
                    {formatKg(r.plan_total)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 text-right">
                    {formatKg(r.actual_total)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 text-right font-medium">
                    {thresholds ? <PctBar pct={r.total_pct} thresholds={thresholds} /> : formatPct(r.total_pct)}
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 text-right">
                    {formatKg(r.overage)}
                  </td>
                  <td
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 text-right ${
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
