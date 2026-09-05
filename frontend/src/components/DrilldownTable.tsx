import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { aggregateChannel, dedupedActualTotal, sum } from '../lib/aggregate';
import { ACTUAL_GROUP, DIFF_GROUP, LOSS_GROUP, PCT_GROUP, PLAN_GROUP, REMARK_GROUP, ROUTE_GROUP } from '../lib/trackingColumnGroups';
import ColumnVisibilityMenu from './ColumnVisibilityMenu';
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
  | 'origin_code'
  | 'dest_code'
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
  { key: 'origin_code', label: 'รหัสต้นทาง', pin: true, group: ROUTE_GROUP },
  { key: 'origin_name', label: 'ต้นทาง', pin: true, group: ROUTE_GROUP },
  { key: 'dest_code', label: 'รหัสปลายทาง', pin: true, group: ROUTE_GROUP },
  { key: 'dest_name', label: 'ปลายทาง', pin: true, group: ROUTE_GROUP },
  { key: 'product_group', label: 'กลุ่มสินค้า', pin: true, group: ROUTE_GROUP },
  { key: 'plan_total', label: 'แผน', align: 'right', group: PLAN_GROUP },
  { key: 'actual_total', label: 'จริง', align: 'right', group: ACTUAL_GROUP },
  { key: 'total_pct', label: '% เทียบแผน', align: 'right', group: PCT_GROUP },
  { key: 'overage', label: 'โอนเกินแผน', align: 'right', group: DIFF_GROUP },
  { key: 'profit_lost', label: 'สูญเสีย', align: 'right', group: LOSS_GROUP },
  { key: 'remark', label: 'หมายเหตุ', group: REMARK_GROUP },
];

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
  const { hiddenKeys, toggle: toggleColumnVisibility } = useColumnVisibility('columnVisibility:dashboard-tracking');
  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hiddenKeys.has(c.key)), [hiddenKeys]);
  const isVisible = (key: SortKey) => !hiddenKeys.has(key);
  const totalWidth = visibleColumns.reduce((a, c) => a + (widths[c.key] ?? defaultColumnWidth(c.label)), 0);
  const pinnedLeft = useMemo(() => pinnedLeftOffsets(visibleColumns, widths), [visibleColumns, widths]);
  const runs = useMemo(() => groupRuns(visibleColumns), [visibleColumns]);

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

  // Only the rows scrolled into view are rendered (see SortableTable.tsx for
  // why). Each virtual item is its own <tbody> — multiple <tbody> elements in
  // one <table> are valid HTML — so a row's expand/collapse (which changes
  // that item's height) is measured and accounted for independently, without
  // needing to track it as a separate virtual item.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 29,
    overscan: 8,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <RouteFilterBar value={filter} onChange={setFilter} options={options} resultCount={filtered.length} />
        <div className="ml-auto">
          <ColumnVisibilityMenu columns={COLUMNS} hiddenKeys={hiddenKeys} onToggle={toggleColumnVisibility} />
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[calc(100vh-600px)] overflow-auto rounded-lg border border-gray-200">
        <table className="text-left text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
          <colgroup>
            {visibleColumns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? defaultColumnWidth(c.label) }} />
            ))}
          </colgroup>
          <thead className="text-xs uppercase text-gray-500">
            <tr className="h-14">
              {runs.map((run, i) => (
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
              {visibleColumns.map((c) => {
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
              {visibleColumns.map((c) => (
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
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} colSpan={visibleColumns.length} />
              </tr>
            )}
          </tbody>
          {virtualRows.map((virtualRow) => {
            const r = sorted[virtualRow.index];
            return (
              <tbody key={r.id} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                <tr
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${virtualRow.index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  {isVisible('production_date') && (
                    <td
                      style={{ left: pinnedLeft.production_date }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.production_date}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td
                      style={{ left: pinnedLeft.status }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {thresholds && <StatusBadge pct={r.total_pct} thresholds={thresholds} />}
                    </td>
                  )}
                  {isVisible('origin_code') && (
                    <td
                      style={{ left: pinnedLeft.origin_code }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.origin_code}
                    </td>
                  )}
                  {isVisible('origin_name') && (
                    <td
                      style={{ left: pinnedLeft.origin_name }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.origin_name}
                    </td>
                  )}
                  {isVisible('dest_code') && (
                    <td
                      style={{ left: pinnedLeft.dest_code }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.dest_code}
                    </td>
                  )}
                  {isVisible('dest_name') && (
                    <td
                      style={{ left: pinnedLeft.dest_name }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.dest_name}
                    </td>
                  )}
                  {isVisible('product_group') && (
                    <td
                      style={{ left: pinnedLeft.product_group }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 ${PIN_CLASS}`}
                    >
                      {r.product_group}
                    </td>
                  )}
                  {isVisible('plan_total') && (
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 text-right">
                      {formatKg(r.plan_total)}
                    </td>
                  )}
                  {isVisible('actual_total') && (
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 text-right">
                      {formatKg(r.actual_total)}
                    </td>
                  )}
                  {isVisible('total_pct') && (
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 text-right font-medium">
                      {thresholds ? <PctBar pct={r.total_pct} thresholds={thresholds} /> : formatPct(r.total_pct)}
                    </td>
                  )}
                  {isVisible('overage') && (
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 text-right">
                      {formatKg(r.overage)}
                    </td>
                  )}
                  {isVisible('profit_lost') && (
                    <td
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1 text-right ${
                        r.profit_lost < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {formatBaht(r.profit_lost)}
                    </td>
                  )}
                  {isVisible('remark') && (
                    <td className="px-1 py-1">
                      <RemarkCell id={r.id} value={r.remark} />
                    </td>
                  )}
                </tr>
                {expandedId === r.id && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={visibleColumns.length} className="px-3 py-3">
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
                              <th className="py-1 text-right">น้ำหนัก</th>
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
              </tbody>
            );
          })}
          <tbody>
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} colSpan={visibleColumns.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
