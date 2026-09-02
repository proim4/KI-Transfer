import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'right';
  sortValue: (row: T) => string | number | null;
  render: (row: T) => ReactNode;
}

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

/** A flat, click-to-sort table. Shared by every raw/tracking table in the app that isn't row-expandable. */
export default function SortableTable<T>({ rows, columns, rowKey, defaultSortKey, maxHeight = '32rem' }: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

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
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            {columns.map((column) => {
              const active = column.key === sortKey;
              return (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-gray-700 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <span className={`inline-flex items-center gap-1 ${column.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {column.label}
                    <span className={active ? 'text-gray-600' : 'text-gray-300'}>
                      {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`whitespace-nowrap px-3 py-2 ${column.align === 'right' ? 'text-right' : ''}`}
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
