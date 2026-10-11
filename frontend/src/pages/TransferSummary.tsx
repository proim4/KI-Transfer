import { useMemo } from 'react';
import { formatKg, formatPct } from '../components/KpiCard';
import LastUpdatedLabel from '../components/LastUpdatedLabel';
import PctBar from '../components/PctBar';
import WeekSelector from '../components/WeekSelector';
import { useStatusThresholds } from '../hooks/useAppSettings';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useTrackingResults } from '../hooks/useTrackingResults';
import { useWeekLastUpdated } from '../hooks/useWeekLastUpdated';
import type { ChannelAggregate } from '../lib/aggregate';
import type { StatusThresholds } from '../lib/statusBadge';
import { summarizeChannel, type SummaryChannel, type SummaryGroup } from '../lib/summaryAggregate';
import type { ProductLine } from '../types/db';

const CHANNEL_HEADER: Record<SummaryChannel, { title: string; className: string }> = {
  weekly: { title: 'แผนโอน Weekly (BSR030)', className: 'bg-navy-900 text-white' },
  daily: { title: 'แผนโอน Daily (BDR130)', className: 'bg-[#FFC000] text-amber-950' },
};

const ACTUAL_HINT =
  'โอนจริงที่นับเข้าแผนนี้: แต่ละเส้นทางนับไม่เกินแผน และถ้าขาดไม่ถึง 10% ถือว่าครบแผน (ปัดหน่วยหยิบ) · โอนจริงถูกนับให้แผน Weekly ก่อน ส่วนที่เหลือจึงนับให้ Daily — ตัวเลขเดียวกับหน้า Dashboard / ติดตามโอน';

function diffToneClass(diff: number): string {
  if (diff < 0) return 'text-red-600';
  if (diff > 0) return 'text-green-700';
  return '';
}

interface SummaryTableProps {
  /** Label column(s) shown before the metrics — one for by-date, two (code + name) for by-plant. */
  labels: string[];
  groups: SummaryGroup[];
  total: ChannelAggregate;
  cellsOf: (g: SummaryGroup) => string[];
  thresholds: StatusThresholds | undefined;
}

function SummaryTable({ labels, groups, total, cellsOf, thresholds }: SummaryTableProps) {
  const th = 'whitespace-nowrap px-3 py-2 text-xs font-semibold';
  const td = 'whitespace-nowrap px-3 py-1';
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {labels.map((l) => (
              <th key={l} className={`${th} bg-[#FFC000] text-amber-950`}>
                {l}
              </th>
            ))}
            <th className={`${th} bg-[#FFC000] text-right text-amber-950`}>แผนโอน</th>
            <th className={`${th} bg-[#375623] text-right text-white`}>
              โอนจริง
              <span title={ACTUAL_HINT} aria-label={ACTUAL_HINT} className="ml-1 cursor-help font-normal">
                ⓘ
              </span>
            </th>
            <th className={`${th} bg-red-600 text-right text-white`}>Diff แผนโอน</th>
            <th className={`${th} bg-[#375623] text-right text-white`}>% โอนเทียบแผน</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.key} className={`border-b border-gray-100 hover:bg-blue-50 ${i % 2 === 1 ? 'bg-amber-50/40' : 'bg-white'}`}>
              {cellsOf(g).map((c, j) => (
                // max-width on a <td> is ignored by auto table layout, so the truncation lives on an inner div.
                <td key={j} className={td} title={c}>
                  <div className="max-w-[16rem] truncate">{c}</div>
                </td>
              ))}
              <td className={`${td} text-right tabular-nums`}>{formatKg(g.planSum)}</td>
              <td className={`${td} text-right tabular-nums`}>{formatKg(g.toleranceAdjSum)}</td>
              <td className={`${td} text-right tabular-nums ${diffToneClass(g.diff)}`}>{formatKg(g.diff)}</td>
              <td className={`${td} w-32`}>{thresholds ? <PctBar pct={g.pct} thresholds={thresholds} /> : formatPct(g.pct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-navy-700 bg-navy-50 font-semibold text-gray-900">
            <td className={td} colSpan={labels.length}>
              Grand Total
            </td>
            <td className={`${td} text-right tabular-nums`}>{formatKg(total.planSum)}</td>
            <td className={`${td} text-right tabular-nums`}>{formatKg(total.toleranceAdjSum)}</td>
            <td className={`${td} text-right tabular-nums ${diffToneClass(total.diff)}`}>{formatKg(total.diff)}</td>
            <td className={`${td} text-right`}>{formatPct(total.pct)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ChannelPanel({ channel, summary, thresholds }: { channel: SummaryChannel; summary: ReturnType<typeof summarizeChannel>; thresholds: StatusThresholds | undefined }) {
  const header = CHANNEL_HEADER[channel];
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <h2 className={`px-4 py-2.5 text-center text-base font-semibold ${header.className}`}>{header.title}</h2>
      {summary.byDate.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">Week นี้ไม่มีแผนโอนจากไฟล์นี้</p>
      ) : (
        <div className="space-y-5 p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">สรุปรายวัน</h3>
            <SummaryTable
              labels={['วันที่โอน']}
              groups={summary.byDate}
              total={summary.total}
              cellsOf={(g) => [g.key]}
              thresholds={thresholds}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">สรุปรายโรงงานปลายทาง</h3>
            <SummaryTable
              labels={['รหัสโรงงานปลายทาง', 'โรงงานปลายทาง']}
              groups={summary.byDest}
              total={summary.total}
              cellsOf={(g) => [g.key, g.name]}
              thresholds={thresholds}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Mirrors the source workbook's summary sheet: the Weekly (BSR030) and Daily
 * (BDR130) plans side by side, each summarised per transfer date and per
 * destination plant. หมู has no Weekly plan, so only its Daily panel shows.
 */
export default function TransferSummary({ productLine = 'chicken' }: { productLine?: ProductLine }) {
  const [weekId, setWeekId] = useDefaultedWeekId(productLine);
  const { data, isLoading } = useTrackingResults(weekId);
  const updatedAt = useWeekLastUpdated(weekId);
  const thresholds = useStatusThresholds();

  const summaries = useMemo(() => {
    const channels: SummaryChannel[] = productLine === 'chicken' ? ['weekly', 'daily'] : ['daily'];
    return channels.map((c) => ({ channel: c, summary: summarizeChannel(data ?? [], c) }));
  }, [data, productLine]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">สรุปรายวัน / รายโรงงาน</h1>
          <p className="text-sm text-gray-500">แผนโอนเทียบโอนจริง แยกตามวันที่โอนและโรงงานปลายทาง</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LastUpdatedLabel at={updatedAt} />
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
        </div>
      </div>

      {!weekId && <p className="text-sm text-gray-500">เลือก Week เพื่อดูข้อมูล</p>}
      {weekId && isLoading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {weekId && !isLoading && (data ?? []).length === 0 && (
        <p className="text-sm text-gray-500">Week นี้ยังไม่มีผลการประมวลผล — ไปที่หน้า Upload Data ก่อน</p>
      )}

      {weekId && !isLoading && (data ?? []).length > 0 && (
        <div className={`grid items-start gap-4 ${summaries.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {summaries.map(({ channel, summary }) => (
            <ChannelPanel key={channel} channel={channel} summary={summary} thresholds={thresholds} />
          ))}
        </div>
      )}
    </div>
  );
}
