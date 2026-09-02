import { Fragment, useMemo, useState } from 'react';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { formatBaht, formatKg, formatPct } from './KpiCard';
import RouteFilterBar, {
  EMPTY_ROUTE_FILTER,
  matchesRouteFilter,
  routeFilterOptions,
  type RouteFilterValue,
} from './RouteFilterBar';
import type { TrackingResultRow } from '../types/db';

interface DrilldownTableProps {
  weekId: string;
  rows: TrackingResultRow[];
}

type SortKey =
  | 'production_date'
  | 'origin_name'
  | 'dest_name'
  | 'product_group'
  | 'plan_total'
  | 'actual_total'
  | 'total_pct'
  | 'overage'
  | 'profit_lost';
type SortDirection = 'asc' | 'desc';

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
  return { date: r.production_date, origin: r.origin_name, dest: r.dest_name, productGroup: r.product_group };
}

export default function DrilldownTable({ weekId, rows }: DrilldownTableProps) {
  const [filter, setFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('production_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const expandedRow = sorted.find((r) => r.id === expandedId) ?? null;
  const breakdown = useActualBreakdown(weekId, expandedRow);

  function sortHeader(label: string, key: SortKey, align?: 'right') {
    const active = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`cursor-pointer select-none px-3 py-2 hover:text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <span className={active ? 'text-gray-600' : 'text-gray-300'}>
            {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </span>
      </th>
    );
  }

  return (
    <div>
      <RouteFilterBar value={filter} onChange={setFilter} options={options} resultCount={filtered.length} />

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {sortHeader('วันที่', 'production_date')}
              {sortHeader('ต้นทาง', 'origin_name')}
              {sortHeader('ปลายทาง', 'dest_name')}
              {sortHeader('กลุ่มสินค้า', 'product_group')}
              {sortHeader('แผน (kg)', 'plan_total', 'right')}
              {sortHeader('จริง (kg)', 'actual_total', 'right')}
              {sortHeader('% เทียบแผน', 'total_pct', 'right')}
              {sortHeader('โอนเกินแผน', 'overage', 'right')}
              {sortHeader('สูญเสีย (บาท)', 'profit_lost', 'right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-3 py-2">{r.production_date}</td>
                  <td className="px-3 py-2">{r.origin_name}</td>
                  <td className="px-3 py-2">{r.dest_name}</td>
                  <td className="px-3 py-2">{r.product_group}</td>
                  <td className="px-3 py-2 text-right">{formatKg(r.plan_total)}</td>
                  <td className="px-3 py-2 text-right">{formatKg(r.actual_total)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatPct(r.total_pct)}</td>
                  <td className="px-3 py-2 text-right">{formatKg(r.overage)}</td>
                  <td className={`px-3 py-2 text-right ${r.profit_lost < 0 ? 'text-red-600' : ''}`}>
                    {formatBaht(r.profit_lost)}
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-3 py-3">
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
