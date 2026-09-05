import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import ColumnVisibilityMenu from './ColumnVisibilityMenu';
import ResizableTh from './ResizableTh';

export interface ColumnGroup {
  key: string;
  /** Small top line of the group band (e.g. the source report code "BDR130"/"ABS0000") — omit for a single-line band. */
  bandTop?: string;
  /** Main/bottom line of the group band — always shown. */
  bandBottom: string;
  /** Solid band styling for the group-name row (row 1). */
  bandClassName: string;
  /** Styling for the column-name row (row 3) — normally the same solid color as the band, not a pastel tint. */
  labelClassName: string;
  /** Light tint for the grand-total row (row 2) — kept light so the total's own colored text (black/green/red) stays legible. */
  totalsTintClassName: string;
  /** True when labelClassName has light/white text — swaps the sort arrow to a light color so it stays visible on a dark band. */
  dark?: boolean;
}

export interface Column<T> {
  key: string;
  label: string;
  align?: 'right';
  /** Freezes this column at the left edge while the rest of the table scrolls horizontally — use on the row's identity column. */
  pin?: boolean;
  /** When set on every column, renders a colored 2-tier header (group band + column names); omit entirely for a plain single-row header. */
  group?: ColumnGroup;
  /** Pre-formatted grand-total for this column (of whatever rows are currently passed in, i.e. already filtered) — shown in its own row right under the column label, aligned with the column like in the source workbook. Omit/blank for columns with nothing to total (identity columns, remarks). */
  total?: string;
  totalTone?: 'good' | 'bad';
  sortValue: (row: T) => string | number | null;
  render: (row: T) => ReactNode;
}

const PIN_CLASS = 'sticky z-10 bg-[inherit]';
const TOTAL_TONE_CLASS: Record<'good' | 'bad', string> = { good: 'text-green-700', bad: 'text-red-700' };

interface SortableTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  defaultSortKey: string;
  maxHeight?: string;
  /** When given, column widths a user drags to are remembered (localStorage) and restored next visit — use a key unique to this table's column set. */
  storageKey?: string;
  /** When given, which columns a user hides via the "คอลัม" menu are remembered (localStorage) and restored next visit — use a key unique to this table's column set. */
  columnVisibilityKey?: string;
  /** A filter bar (e.g. RouteFilterBar) rendered on the same row as the "คอลัม" button, to its left, instead of the caller stacking it above the table separately. */
  filterBar?: ReactNode;
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a ?? '').localeCompare(String(b ?? ''));
  }
  // Nulls sort last ascending / first descending — never silently dropped.
  const an = a === null ? -Infinity : a;
  const bn = b === null ? -Infinity : b;
  return an - bn;
}

/**
 * Collapses consecutive columns sharing the same group.key into one run, for
 * the group band's colSpan. A pinned column always starts its own run (even
 * if it shares a group.key with its neighbor) — a colSpan cell can't be
 * "pinned for only part of its width", so the pinned column's own band cell
 * must be a standalone, independently-stickyable <th>.
 */
export function groupRuns<C extends { key: string; group?: ColumnGroup; pin?: boolean }>(
  columns: C[],
): { group: ColumnGroup; span: number; pin: boolean; pinKey?: string }[] {
  const runs: { group: ColumnGroup; span: number; pin: boolean; pinKey?: string }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (!column.group) continue;
    if (last && !last.pin && !column.pin && last.group.key === column.group.key) {
      last.span += 1;
    } else {
      runs.push({ group: column.group, span: 1, pin: !!column.pin, pinKey: column.pin ? column.key : undefined });
    }
  }
  return runs;
}

/**
 * Cumulative left-edge pixel offset for each pinned column, in column order,
 * so several columns can freeze side by side (not all stacked at left:0).
 */
export function pinnedLeftOffsets<C extends { key: string; label: string; pin?: boolean }>(
  columns: C[],
  widths: Record<string, number>,
): Record<string, number> {
  const offsets: Record<string, number> = {};
  let left = 0;
  for (const column of columns) {
    if (!column.pin) continue;
    offsets[column.key] = left;
    left += widths[column.key] ?? defaultColumnWidth(column.label);
  }
  return offsets;
}

/** A flat, click-to-sort, drag-to-resize table. Shared by every raw/tracking table in the app that isn't row-expandable. */
export default function SortableTable<T>({
  rows,
  columns,
  rowKey,
  defaultSortKey,
  maxHeight = '32rem',
  storageKey,
  columnVisibilityKey,
  filterBar,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  const initialWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, defaultColumnWidth(c.label)])),
    [columns],
  );
  const { widths, startResize } = useColumnWidths(initialWidths, storageKey);
  const { hiddenKeys, toggle: toggleColumnVisibility } = useColumnVisibility(columnVisibilityKey);
  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenKeys.has(c.key)), [columns, hiddenKeys]);
  const totalWidth = visibleColumns.reduce((a, c) => a + (widths[c.key] ?? defaultColumnWidth(c.label)), 0);
  const hasGroups = visibleColumns.length > 0 && visibleColumns.every((c) => c.group);
  const hasTotals = visibleColumns.some((c) => c.total !== undefined);
  const runs = useMemo(() => (hasGroups ? groupRuns(visibleColumns) : []), [visibleColumns, hasGroups]);
  const pinnedLeft = useMemo(() => pinnedLeftOffsets(visibleColumns, widths), [visibleColumns, widths]);

  // Fixed row heights so each sticky row's offset is exact without measuring
  // — only applied once there's a second/third row to stack, so a plain
  // single-row table (no groups, no totals) renders exactly as it always has.
  // Row order (top to bottom): group band -> totals -> column labels -> data.
  // Heights (h-14/h-8/h-9) track the reference workbook's own row heights.
  const labelRowClass = hasTotals || hasGroups ? 'h-9' : '';
  const totalsTop = hasGroups ? 'top-14' : 'top-0';
  const labelTop = hasTotals ? (hasGroups ? 'top-[88px]' : 'top-8') : hasGroups ? 'top-14' : 'top-0';

  function handleSort(key: string) {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  }

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(column.sortValue(a), column.sortValue(b));
      return direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortKey, direction]);

  // Only the rows actually scrolled into view are rendered — a table with
  // hundreds of rows used to render every <tr>/<td> on every keystroke/sort,
  // which is what made large tables (Weekly, รวม) feel sluggish. Sticky
  // headers and pinned columns are untouched by this — only which <tr>s get
  // mounted changes, not how any of them are positioned/styled.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 33,
    overscan: 8,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {filterBar}
        <div className="ml-auto">
          <ColumnVisibilityMenu columns={columns} hiddenKeys={hiddenKeys} onToggle={toggleColumnVisibility} />
        </div>
      </div>
      <div ref={scrollRef} className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight }}>
        <table className="text-left text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
          <colgroup>
            {visibleColumns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? defaultColumnWidth(c.label) }} />
            ))}
          </colgroup>
          <thead className="text-xs uppercase text-gray-500">
            {hasGroups && (
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
            )}
            {hasTotals && (
              <tr className="h-8">
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    style={column.pin ? { left: pinnedLeft[column.key] } : undefined}
                    className={`sticky ${totalsTop} overflow-hidden px-3 text-sm font-bold normal-case ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.pin ? 'z-30' : 'z-10'} ${
                      column.group ? column.group.totalsTintClassName : 'bg-gray-50'
                    } ${column.totalTone ? TOTAL_TONE_CLASS[column.totalTone] : 'text-gray-900'}`}
                  >
                    {column.total ?? ''}
                  </th>
                ))}
              </tr>
            )}
            <tr className={labelRowClass}>
              {visibleColumns.map((column) => (
                <ResizableTh
                  key={column.key}
                  width={widths[column.key] ?? defaultColumnWidth(column.label)}
                  left={column.pin ? pinnedLeft[column.key] : undefined}
                  align={column.align}
                  onClick={() => handleSort(column.key)}
                  onMouseDownResize={startResize(column.key)}
                  className={`sticky ${labelTop} ${column.pin ? 'z-30' : 'z-10'} ${
                    column.group ? column.group.labelClassName : 'bg-gray-50'
                  }`}
                >
                  {column.label}
                  <span
                    className={
                      column.key === sortKey
                        ? column.group?.dark
                          ? 'text-white'
                          : 'text-gray-600'
                        : column.group?.dark
                          ? 'text-white/50'
                          : 'text-gray-300'
                    }
                  >
                    {column.key === sortKey ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} colSpan={visibleColumns.length} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = sorted[virtualRow.index];
              return (
                <tr
                  key={rowKey(row)}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={`hover:bg-blue-50 ${virtualRow.index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      style={column.pin ? { left: pinnedLeft[column.key] } : undefined}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-1.5 ${
                        column.align === 'right' ? 'text-right' : ''
                      } ${column.pin ? PIN_CLASS : ''}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
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
