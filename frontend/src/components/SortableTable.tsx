import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { defaultColumnWidth, useColumnWidths } from '../hooks/useColumnWidths';
import ResizableTh from './ResizableTh';

export interface ColumnGroup {
  key: string;
  label: string;
  /** Solid band styling for the top header row. */
  bandClassName: string;
  /** Light tint for the per-column header row underneath the band. */
  tintClassName: string;
}

export interface Column<T> {
  key: string;
  label: string;
  align?: 'right';
  /** Freezes this column at the left edge while the rest of the table scrolls horizontally — use on the row's identity column. */
  pin?: boolean;
  /** When set on every column, renders a colored 2-tier header (group band + column names); omit entirely for a plain single-row header. */
  group?: ColumnGroup;
  sortValue: (row: T) => string | number | null;
  render: (row: T) => ReactNode;
}

const PIN_CLASS = 'sticky left-0 z-10 bg-white';

interface SortableTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  defaultSortKey: string;
  maxHeight?: string;
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
export function groupRuns<C extends { group?: ColumnGroup; pin?: boolean }>(
  columns: C[],
): { group: ColumnGroup; span: number; pin: boolean }[] {
  const runs: { group: ColumnGroup; span: number; pin: boolean }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (!column.group) continue;
    if (last && !last.pin && !column.pin && last.group.key === column.group.key) {
      last.span += 1;
    } else {
      runs.push({ group: column.group, span: 1, pin: !!column.pin });
    }
  }
  return runs;
}

/** A flat, click-to-sort, drag-to-resize table. Shared by every raw/tracking table in the app that isn't row-expandable. */
export default function SortableTable<T>({ rows, columns, rowKey, defaultSortKey, maxHeight = '32rem' }: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  const initialWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, defaultColumnWidth(c.label)])),
    [columns],
  );
  const { widths, startResize } = useColumnWidths(initialWidths);
  const totalWidth = columns.reduce((a, c) => a + (widths[c.key] ?? defaultColumnWidth(c.label)), 0);
  const hasGroups = columns.length > 0 && columns.every((c) => c.group);
  const runs = useMemo(() => (hasGroups ? groupRuns(columns) : []), [columns, hasGroups]);

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

  return (
    <div className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight }}>
      <table className="text-left text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] ?? defaultColumnWidth(c.label) }} />
          ))}
        </colgroup>
        <thead className="text-xs uppercase text-gray-500">
          {hasGroups && (
            <tr className="h-7">
              {runs.map((run, i) => (
                <th
                  key={`${run.group.key}-${i}`}
                  colSpan={run.span}
                  className={`sticky top-0 overflow-hidden px-3 text-left text-[11px] font-semibold normal-case tracking-wide ${
                    run.pin ? 'left-0 z-30' : 'z-20'
                  } ${run.group.bandClassName}`}
                >
                  {run.group.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((column) => (
              <ResizableTh
                key={column.key}
                width={widths[column.key] ?? defaultColumnWidth(column.label)}
                align={column.align}
                onClick={() => handleSort(column.key)}
                onMouseDownResize={startResize(column.key)}
                className={`sticky ${hasGroups ? 'top-7' : 'top-0'} ${column.pin ? 'left-0 z-30' : 'z-10'} ${
                  column.group ? column.group.tintClassName : 'bg-gray-50'
                }`}
              >
                {column.label}
                <span className={column.key === sortKey ? 'text-gray-600' : 'text-gray-300'}>
                  {column.key === sortKey ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                </span>
              </ResizableTh>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 ${
                    column.align === 'right' ? 'text-right' : ''
                  } ${column.pin ? PIN_CLASS : ''}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
