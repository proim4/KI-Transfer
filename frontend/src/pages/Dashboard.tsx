import { useState } from 'react';
import DrilldownTable from '../components/DrilldownTable';
import KpiCard, { formatBaht, formatKg, formatPct } from '../components/KpiCard';
import WeekSelector from '../components/WeekSelector';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useUploads } from '../hooks/useUploads';
import { useWeeks } from '../hooks/useWeeks';
import { useTrackingResults, useUnmatchedActual } from '../hooks/useTrackingResults';
import { aggregateChannel, aggregateReject, dedupedActualTotal, sum } from '../lib/aggregate';
import { exportWeekToExcel } from '../lib/exportExcel';
import { formatDateTime } from '../lib/formatDateTime';
import { lastUpdatedAt } from '../lib/lastUpdated';
import { computeStatus } from '../lib/statusBadge';
import type { ProductLine } from '../types/db';

const REQUIRED_FILE_COUNT: Record<ProductLine, number> = { chicken: 3, pork: 2 };

interface DashboardProps {
  productLine?: ProductLine;
}

export default function Dashboard({ productLine = 'chicken' }: DashboardProps) {
  const [weekId, setWeekId] = useDefaultedWeekId(productLine);
  const { data: weeks } = useWeeks(productLine);
  const { data: results, isLoading } = useTrackingResults(weekId);
  const { data: unmatched } = useUnmatchedActual(weekId);
  const { data: uploads } = useUploads(weekId);
  const thresholds = useStatusThresholds();
  const [exporting, setExporting] = useState(false);

  const week = weeks?.find((w) => w.id === weekId);

  async function handleExport() {
    if (!weekId || !week || !results) return;
    setExporting(true);
    try {
      await exportWeekToExcel(weekId, week.label, results);
    } finally {
      setExporting(false);
    }
  }

  const rows = results ?? [];
  const weekly = aggregateChannel(rows, 'weekly');
  const daily = aggregateChannel(rows, 'daily');
  const total = aggregateChannel(rows, 'total');
  const reject = aggregateReject(rows, 'total');
  const actualTotal = dedupedActualTotal(rows);
  const lossTotal = sum(rows.map((r) => Number(r.profit_lost)));
  const unmatchedTotal = sum((unmatched ?? []).map((u) => Number(u.total_weight_kg)));

  const updatedAt = lastUpdatedAt(uploads);
  const achievementStatus = thresholds && computeStatus(total.pct, thresholds);
  const achievementTone =
    achievementStatus?.color === 'green' ? 'good' : achievementStatus?.color === 'red' ? 'bad' : achievementStatus?.color === 'amber' ? 'warn' : 'default';
  const anyOverage = rows.some((r) => Number(r.overage) > 0);

  const kpiRowStorageKey = `dashboard-kpi-row-collapsed:${productLine}`;
  const [kpiRowCollapsed, setKpiRowCollapsed] = useState(() => {
    try {
      return localStorage.getItem(kpiRowStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  function toggleKpiRow() {
    setKpiRowCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(kpiRowStorageKey, String(next));
      } catch {
        // localStorage unavailable (private browsing, quota, etc.) — collapsing still works for this session, just isn't remembered.
      }
      return next;
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tracking โอนเทียบแผน</h1>
          <p className="text-sm text-gray-500">Transfer Performance Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {week && (
            <p className="text-sm text-gray-500">
              📅 {week.label}
              {updatedAt && <> · อัปเดตล่าสุด {formatDateTime(updatedAt)}</>}
              {uploads && (
                <>
                  {' '}
                  · {uploads.length}/{REQUIRED_FILE_COUNT[productLine]} ไฟล์
                </>
              )}
            </p>
          )}
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
          {weekId && rows.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {!weekId && <p className="text-sm text-gray-500">ยังไม่มีข้อมูล Week ในระบบ — ไปที่หน้า Upload Data เพื่อเริ่มต้น</p>}
        {weekId && isLoading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
        {weekId && !isLoading && rows.length === 0 && (
          <p className="text-sm text-gray-500">Week นี้ยังไม่มีผลการประมวลผล — ไปที่หน้า Upload Data ก่อน</p>
        )}

        {weekId && rows.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-4">
              <KpiCard size="hero" label="ปริมาณแผนโอน (Plan)" value={formatKg(total.planSum)} />
              <KpiCard size="hero" label="ปริมาณโอนจริง (Actual)" value={formatKg(actualTotal)} />
              <KpiCard
                size="hero"
                label="Achievement %"
                value={formatPct(total.pct)}
                tone={achievementTone}
                sub={anyOverage ? 'มีการโอนเกินแผนบางเส้นทาง' : undefined}
              />
              <div className="relative h-full">
                <button
                  type="button"
                  onClick={toggleKpiRow}
                  title={kpiRowCollapsed ? 'แสดงรายละเอียด' : 'ซ่อนรายละเอียด'}
                  aria-label={kpiRowCollapsed ? 'แสดงรายละเอียด' : 'ซ่อนรายละเอียด'}
                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700"
                >
                  <span className="text-xs leading-none">{kpiRowCollapsed ? '▾' : '▴'}</span>
                </button>
                <KpiCard
                  size="hero"
                  label="มูลค่าสูญเสีย"
                  value={formatBaht(lossTotal)}
                  tone={lossTotal < 0 ? 'bad' : 'default'}
                />
              </div>
            </div>

            {!kpiRowCollapsed && (
              <div
                className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${productLine === 'chicken' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
              >
                {productLine === 'chicken' && <KpiCard label="% โอนเทียบแผน Weekly" value={formatPct(weekly.pct)} />}
                <KpiCard label="% โอนเทียบแผน Daily" value={formatPct(daily.pct)} />
                <KpiCard label="ปริมาณโอนจริงตามแผน" value={formatKg(total.toleranceAdjSum)} />
                <KpiCard label="ปริมาณ Reject" value={formatKg(reject.rejectSum)} sub={`% Reject: ${formatPct(reject.pct)}`} />
                <KpiCard label="โอนไม่ตรงแผนเลย" value={formatKg(unmatchedTotal)} sub="สินค้า/เส้นทางที่ไม่มีในแผน" />
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <DrilldownTable weekId={weekId} rows={rows} title="Tracking Data" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
