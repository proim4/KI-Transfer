import { useState } from 'react';
import DrilldownTable from '../components/DrilldownTable';
import KpiCard, { formatBaht, formatKg, formatPct } from '../components/KpiCard';
import TrendChart from '../components/TrendChart';
import WeekSelector from '../components/WeekSelector';
import { useWeeks } from '../hooks/useWeeks';
import { useTrackingResults, useUnmatchedActual } from '../hooks/useTrackingResults';
import { aggregateChannel, aggregateReject, buildDailyTrend, dedupedActualTotal, sum } from '../lib/aggregate';
import { exportWeekToExcel } from '../lib/exportExcel';

export default function Dashboard() {
  const [weekId, setWeekId] = useState<string | null>(null);
  const { data: weeks } = useWeeks();
  const { data: results, isLoading } = useTrackingResults(weekId);
  const { data: unmatched } = useUnmatchedActual(weekId);
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
  const trend = buildDailyTrend(rows);
  const unmatchedTotal = sum((unmatched ?? []).map((u) => Number(u.total_weight_kg)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Summary Dashboard</h1>
          <div className="mt-2">
            <WeekSelector value={weekId} onChange={setWeekId} />
          </div>
        </div>
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

      {!weekId && <p className="text-sm text-gray-500">เลือก Week เพื่อดูข้อมูล</p>}
      {weekId && isLoading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {weekId && !isLoading && rows.length === 0 && (
        <p className="text-sm text-gray-500">Week นี้ยังไม่มีผลการประมวลผล — ไปที่หน้า Upload Data ก่อน</p>
      )}

      {weekId && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="% โอนเทียบแผน Weekly" value={formatPct(weekly.pct)} />
            <KpiCard label="% โอนเทียบแผน Daily" value={formatPct(daily.pct)} />
            <KpiCard label="ปริมาณแผนโอน" value={formatKg(total.planSum)} />
            <KpiCard label="ปริมาณโอนจริง" value={formatKg(actualTotal)} />
            <KpiCard label="ปริมาณโอนจริงตามแผน" value={formatKg(total.toleranceAdjSum)} />
            <KpiCard label="ปริมาณ Reject" value={formatKg(reject.rejectSum)} sub={`% Reject: ${formatPct(reject.pct)}`} />
            <KpiCard
              label="มูลค่าสูญเสีย"
              value={formatBaht(lossTotal)}
              tone={lossTotal < 0 ? 'bad' : 'default'}
            />
            <KpiCard
              label="โอนไม่ตรงแผนเลย"
              value={formatKg(unmatchedTotal)}
              sub="สินค้า/เส้นทางที่ไม่มีในแผน"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Trend รายวัน</h2>
            <TrendChart data={trend} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">รายละเอียด (Drill-down)</h2>
            <DrilldownTable weekId={weekId} rows={rows} />
          </div>
        </>
      )}
    </div>
  );
}
