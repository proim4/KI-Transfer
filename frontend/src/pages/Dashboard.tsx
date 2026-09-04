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
import { formatDate, formatDateTime, formatTime } from '../lib/formatDateTime';
import { computeStatus } from '../lib/statusBadge';

export default function Dashboard() {
  const [weekId, setWeekId] = useDefaultedWeekId();
  const { data: weeks } = useWeeks();
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

  const lastUpdatedAt = (uploads ?? [])
    .map((u) => u.updated_at)
    .sort()
    .at(-1);
  const achievementStatus = thresholds && computeStatus(total.pct, thresholds);
  const achievementTone =
    achievementStatus?.color === 'green' ? 'good' : achievementStatus?.color === 'red' ? 'bad' : achievementStatus?.color === 'amber' ? 'warn' : 'default';
  const anyOverage = rows.some((r) => Number(r.overage) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tracking โอนเทียบแผน</h1>
          <p className="text-sm text-gray-500">Transfer Performance Tracking</p>
          {week && (
            <p className="mt-1 text-sm text-gray-500">
              📅 {week.label}
              {lastUpdatedAt && <> · อัปเดตล่าสุด {formatDateTime(lastUpdatedAt)}</>}
              {uploads && <> · {uploads.length}/3 ไฟล์</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <WeekSelector value={weekId} onChange={setWeekId} />
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

      {!weekId && <p className="text-sm text-gray-500">ยังไม่มีข้อมูล Week ในระบบ — ไปที่หน้า Upload Data เพื่อเริ่มต้น</p>}
      {weekId && isLoading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {weekId && !isLoading && rows.length === 0 && (
        <p className="text-sm text-gray-500">Week นี้ยังไม่มีผลการประมวลผล — ไปที่หน้า Upload Data ก่อน</p>
      )}

      {weekId && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard size="hero" label="ปริมาณแผนโอน (Plan)" value={formatKg(total.planSum)} />
            <KpiCard size="hero" label="ปริมาณโอนจริง (Actual)" value={formatKg(actualTotal)} />
            <KpiCard
              size="hero"
              label="Achievement %"
              value={formatPct(total.pct)}
              tone={achievementTone}
              sub={anyOverage ? 'มีการโอนเกินแผนบางเส้นทาง' : undefined}
            />
            <KpiCard
              size="hero"
              label="Last Update"
              value={lastUpdatedAt ? formatTime(lastUpdatedAt) : '-'}
              sub={lastUpdatedAt ? formatDate(lastUpdatedAt) : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="% โอนเทียบแผน Weekly" value={formatPct(weekly.pct)} />
            <KpiCard label="% โอนเทียบแผน Daily" value={formatPct(daily.pct)} />
            <KpiCard label="ปริมาณโอนจริงตามแผน" value={formatKg(total.toleranceAdjSum)} />
            <KpiCard label="ปริมาณ Reject" value={formatKg(reject.rejectSum)} sub={`% Reject: ${formatPct(reject.pct)}`} />
            <KpiCard label="มูลค่าสูญเสีย" value={formatBaht(lossTotal)} tone={lossTotal < 0 ? 'bad' : 'default'} />
            <KpiCard label="โอนไม่ตรงแผนเลย" value={formatKg(unmatchedTotal)} sub="สินค้า/เส้นทางที่ไม่มีในแผน" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Tracking Data</h2>
            <DrilldownTable weekId={weekId} rows={rows} />
          </div>
        </>
      )}
    </div>
  );
}
