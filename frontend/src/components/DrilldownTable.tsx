import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { aggregateChannel, dedupedActualTotal, sum } from '../lib/aggregate';
import { computeStatus, type StatusThresholds } from '../lib/statusBadge';
import { ACTUAL_GROUP, DIFF_GROUP, LOSS_GROUP, PCT_GROUP, PLAN_GROUP, PROFIT_GROUP, REMARK_GROUP, ROUTE_GROUP } from '../lib/trackingColumnGroups';
import ClearFilterButton from './ClearFilterButton';
import ColumnVisibilityMenu from './ColumnVisibilityMenu';
import { formatBaht, formatKg, formatPct } from './KpiCard';
import PctBar from './PctBar';
import ResizableTh from './ResizableTh';
import RemarkCell from './RemarkCell';
import { groupRuns, pinnedLeftOffsets, type ColumnGroup, type HeaderFilterConfig } from './SortableTable';
import StatusBadge from './StatusBadge';
import type { TrackingResultRow } from '../types/db';

interface DrilldownTableProps {
  weekId: string;
  rows: TrackingResultRow[];
  /** Heading shown on the same row as the search box / Clear Filter / คอลัม, instead of the caller stacking it above separately. */
  title?: string;
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
  | 'profit_realized'
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
  { key: 'overage', label: 'โอนเกินแผน', align: 'right', group: DIFF_GROUP },
  { key: 'total_pct', label: '% เทียบแผน', align: 'right', group: PCT_GROUP },
  { key: 'profit_realized', label: 'กำไรที่ได้', align: 'right', group: PROFIT_GROUP },
  { key: 'profit_lost', label: 'สูญเสีย', align: 'right', group: LOSS_GROUP },
  { key: 'remark', label: 'หมายเหตุ', group: REMARK_GROUP },
];

const TOTAL_TONE_CLASS: Record<'good' | 'bad', string> = { good: 'text-green-700', bad: 'text-red-700' };

function sortValue(row: TrackingResultRow, key: SortKey): string | number | null {
  return key === 'status' ? row.total_pct : row[key];
}

const PIN_CLASS = 'sticky z-10';

const GROUP_BY_KEY: Record<SortKey, ColumnGroup> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.group]),
) as Record<SortKey, ColumnGroup>;

function rowBg(key: SortKey, isTintRow: boolean): string {
  return isTintRow ? GROUP_BY_KEY[key].totalsTintClassName : 'bg-white';
}

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

function searchText(r: TrackingResultRow): string {
  return `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group} ${r.remark ?? ''}`.toLowerCase();
}

/** Same accessor as sortValue, except "status" resolves to its category label (ตามแผน/ต่ำกว่าแผน/...) instead of the raw pct — filtering by status should match what the badge shows, not a number. */
function filterValue(row: TrackingResultRow, key: SortKey, thresholds: StatusThresholds | undefined): string | number | null {
  if (key === 'status') return thresholds ? computeStatus(row.total_pct, thresholds).label : null;
  return sortValue(row, key);
}

export default function DrilldownTable({ weekId, rows, title }: DrilldownTableProps) {
  const thresholds = useStatusThresholds();
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // A filter set on one Week must not silently keep filtering a different
  // Week's data once selected — the header dropdown would even show
  // "ทั้งหมด" again (its old value isn't among the new Week's options),
  // making the leftover filter invisible while it's still excluding rows.
  useEffect(() => {
    setSearch('');
    setColumnFilters({});
  }, [weekId]);
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

  // Unique values per column (from the full unfiltered row set) power each
  // header cell's Excel-style filter dropdown.
  const columnOptions = useMemo(() => {
    const map: Partial<Record<SortKey, string[]>> = {};
    for (const c of COLUMNS) {
      const set = new Set<string>();
      for (const r of rows) {
        const v = filterValue(r, c.key, thresholds);
        if (v !== null && v !== '') set.add(String(v));
      }
      map[c.key] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return map;
  }, [rows, thresholds]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (search && !searchText(r).includes(search.toLowerCase())) return false;
        return COLUMNS.every((c) => {
          const fv = columnFilters[c.key];
          if (!fv) return true;
          return String(filterValue(r, c.key, thresholds) ?? '') === fv;
        });
      }),
    [rows, search, columnFilters, thresholds],
  );

  // Every column's header cell gets its own filter dropdown alongside the
  // existing click-to-sort label/arrow.
  function headerFilterFor(key: SortKey): HeaderFilterConfig {
    return {
      value: columnFilters[key] ?? '',
      onChange: (v) => setColumnFilters((f) => ({ ...f, [key]: v })),
      options: columnOptions[key] ?? [],
      placeholder: 'ทั้งหมด',
    };
  }

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
      profit_realized: { value: formatBaht(sum(filtered.map((r) => Number(r.profit_realized)))), tone: 'good' },
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
        {title && <h2 className="text-sm font-semibold text-gray-700">{title}</h2>}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา..."
          className="w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
        />
        <span className="text-xs text-gray-400">{filtered.length} รายการ</span>
        <div className="ml-auto flex items-center gap-2">
          <ClearFilterButton
            active={search !== '' || Object.values(columnFilters).some(Boolean)}
            onClear={() => {
              setSearch('');
              setColumnFilters({});
            }}
          />
          <ColumnVisibilityMenu columns={COLUMNS} hiddenKeys={hiddenKeys} onToggle={toggleColumnVisibility} />
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[calc(100vh-380px)] overflow-auto rounded-lg border border-gray-200">
        <table className="text-left text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
          <colgroup>
            {visibleColumns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? defaultColumnWidth(c.label) }} />
            ))}
          </colgroup>
          <thead className="text-xs uppercase text-gray-500">
            <tr className="h-[40px]">
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
                    className={`sticky top-[40px] overflow-hidden px-3 text-sm font-bold normal-case ${
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
              {visibleColumns.map((c) => {
                const headerFilter = headerFilterFor(c.key);
                return (
                  <ResizableTh
                    key={c.key}
                    width={widths[c.key] ?? defaultColumnWidth(c.label)}
                    left={c.pin ? pinnedLeft[c.key] : undefined}
                    align={c.align}
                    onClick={() => handleSort(c.key)}
                    onMouseDownResize={startResize(c.key)}
                    className={`sticky top-[72px] ${c.pin ? 'z-30' : 'z-10'} ${c.group.labelClassName}`}
                    filter={
                      <select
                        value={headerFilter.value}
                        onChange={(e) => headerFilter.onChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={`กรอง ${c.label}`}
                        className="w-4 shrink-0 cursor-pointer border-none bg-transparent p-0 text-[10px] text-inherit outline-none"
                      >
                        <option value="">{headerFilter.placeholder}</option>
                        {headerFilter.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    }
                  >
                    <span className="truncate">{c.label}</span>
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
                );
              })}
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
            const isTintRow = virtualRow.index % 2 === 1;
            return (
              <tbody key={r.id} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                <tr
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="group cursor-pointer border-b border-gray-100"
                >
                  {isVisible('production_date') && (
                    <td
                      style={{ left: pinnedLeft.production_date }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('production_date', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.production_date}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td
                      style={{ left: pinnedLeft.status }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('status', isTintRow)} ${PIN_CLASS}`}
                    >
                      {thresholds && <StatusBadge pct={r.total_pct} thresholds={thresholds} />}
                    </td>
                  )}
                  {isVisible('origin_code') && (
                    <td
                      style={{ left: pinnedLeft.origin_code }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('origin_code', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.origin_code}
                    </td>
                  )}
                  {isVisible('origin_name') && (
                    <td
                      style={{ left: pinnedLeft.origin_name }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('origin_name', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.origin_name}
                    </td>
                  )}
                  {isVisible('dest_code') && (
                    <td
                      style={{ left: pinnedLeft.dest_code }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('dest_code', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.dest_code}
                    </td>
                  )}
                  {isVisible('dest_name') && (
                    <td
                      style={{ left: pinnedLeft.dest_name }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('dest_name', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.dest_name}
                    </td>
                  )}
                  {isVisible('product_group') && (
                    <td
                      style={{ left: pinnedLeft.product_group }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 group-hover:bg-blue-50 ${rowBg('product_group', isTintRow)} ${PIN_CLASS}`}
                    >
                      {r.product_group}
                    </td>
                  )}
                  {isVisible('plan_total') && (
                    <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right group-hover:bg-blue-50 ${rowBg('plan_total', isTintRow)}`}>
                      {formatKg(r.plan_total)}
                    </td>
                  )}
                  {isVisible('actual_total') && (
                    <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right group-hover:bg-blue-50 ${rowBg('actual_total', isTintRow)}`}>
                      {formatKg(r.actual_total)}
                    </td>
                  )}
                  {isVisible('overage') && (
                    <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right group-hover:bg-blue-50 ${rowBg('overage', isTintRow)}`}>
                      {formatKg(r.overage)}
                    </td>
                  )}
                  {isVisible('total_pct') && (
                    <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right font-medium group-hover:bg-blue-50 ${rowBg('total_pct', isTintRow)}`}>
                      {thresholds ? <PctBar pct={r.total_pct} thresholds={thresholds} /> : formatPct(r.total_pct)}
                    </td>
                  )}
                  {isVisible('profit_realized') && (
                    <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right group-hover:bg-blue-50 ${rowBg('profit_realized', isTintRow)}`}>
                      {formatBaht(r.profit_realized)}
                    </td>
                  )}
                  {isVisible('profit_lost') && (
                    <td
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-0.5 text-right group-hover:bg-blue-50 ${rowBg('profit_lost', isTintRow)} ${
                        r.profit_lost < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {formatBaht(r.profit_lost)}
                    </td>
                  )}
                  {isVisible('remark') && (
                    <td className={`px-1 py-0.5 group-hover:bg-blue-50 ${rowBg('remark', isTintRow)}`}>
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
