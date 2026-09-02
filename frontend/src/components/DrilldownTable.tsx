import { Fragment, useMemo, useState } from 'react';
import { useActualBreakdown } from '../hooks/useActualBreakdown';
import { formatBaht, formatKg, formatPct } from './KpiCard';
import type { TrackingResultRow } from '../types/db';

interface DrilldownTableProps {
  weekId: string;
  rows: TrackingResultRow[];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export default function DrilldownTable({ weekId, rows }: DrilldownTableProps) {
  const [date, setDate] = useState('');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [productGroup, setProductGroup] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const dates = useMemo(() => uniqueSorted(rows.map((r) => r.production_date)), [rows]);
  const origins = useMemo(() => uniqueSorted(rows.map((r) => r.origin_name)), [rows]);
  const dests = useMemo(() => uniqueSorted(rows.map((r) => r.dest_name)), [rows]);
  const productGroups = useMemo(() => uniqueSorted(rows.map((r) => r.product_group)), [rows]);

  const filtered = rows.filter(
    (r) =>
      (!date || r.production_date === date) &&
      (!origin || r.origin_name === origin) &&
      (!dest || r.dest_name === dest) &&
      (!productGroup || r.product_group === productGroup),
  );

  const expandedRow = filtered.find((r) => r.id === expandedId) ?? null;
  const breakdown = useActualBreakdown(weekId, expandedRow);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">ทุกวันที่</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">ทุกโรงงานต้นทาง</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={dest} onChange={(e) => setDest(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">ทุกโรงงานปลายทาง</option>
          {dests.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={productGroup}
          onChange={(e) => setProductGroup(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">ทุกกลุ่มสินค้า</option>
          {productGroups.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="self-center text-xs text-gray-400">{filtered.length} รายการ</span>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">ต้นทาง</th>
              <th className="px-3 py-2">ปลายทาง</th>
              <th className="px-3 py-2">กลุ่มสินค้า</th>
              <th className="px-3 py-2 text-right">แผน (kg)</th>
              <th className="px-3 py-2 text-right">จริง (kg)</th>
              <th className="px-3 py-2 text-right">% เทียบแผน</th>
              <th className="px-3 py-2 text-right">โอนเกินแผน</th>
              <th className="px-3 py-2 text-right">สูญเสีย (บาท)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
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
