import { useMemo, useState } from 'react';
import CodeName from '../components/CodeName';
import { formatBaht, formatKg, formatPct } from '../components/KpiCard';
import PctBar from '../components/PctBar';
import RemarkCell from '../components/RemarkCell';
import StatusBadge from '../components/StatusBadge';
import { useStatusThresholds } from '../hooks/useAppSettings';
import RouteFilterBar, {
  EMPTY_ROUTE_FILTER,
  matchesRouteFilter,
  routeFilterOptions,
  type RouteFilterValue,
} from '../components/RouteFilterBar';
import SortableTable, { type Column } from '../components/SortableTable';
import WeekSelector from '../components/WeekSelector';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useTrackingResults } from '../hooks/useTrackingResults';
import { useWeeks } from '../hooks/useWeeks';
import { aggregateChannel, dedupedActualTotal, sum } from '../lib/aggregate';
import { exportWeekToExcel } from '../lib/exportExcel';
import {
  ACTUAL_GROUP,
  DIFF_GROUP,
  LOSS_GROUP,
  PCT_GROUP,
  PLAN_GROUP,
  PROFIT_GROUP,
  REMARK_GROUP,
  ROUTE_GROUP,
} from '../lib/trackingColumnGroups';
import type { ProductLine, TrackingResultRow } from '../types/db';

export type Channel = 'weekly' | 'daily' | 'total';

interface TrackingChannelProps {
  channel: Channel;
  title: string;
  productLine?: ProductLine;
}

const PLAN_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'plan_weekly',
  daily: 'plan_daily',
  total: 'plan_total',
};
const DIFF_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'weekly_diff',
  daily: 'daily_diff',
  total: 'total_diff',
};
const PCT_FIELD: Record<Channel, keyof TrackingResultRow> = {
  weekly: 'weekly_pct',
  daily: 'daily_pct',
  total: 'total_pct',
};
const PLAN_LABEL: Record<Channel, string> = {
  weekly: 'แผนโอน Weekly',
  daily: 'แผนโอน Daily',
  total: 'แผนโอนรวม',
};

function pickRoute(r: TrackingResultRow) {
  return {
    date: r.production_date,
    origin: r.origin_name,
    dest: r.dest_name,
    productGroup: r.product_group,
    searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group}`,
  };
}

/** Diff (kg) text tinted red for a shortfall, green for a surplus — matches the profit_lost convention already used elsewhere in this table. */
function diffToneClass(diff: number): string {
  if (diff < 0) return 'text-red-600';
  if (diff > 0) return 'text-green-700';
  return '';
}

/**
 * Mirrors the original workbook's per-channel tracking sheets
 * ("ติดตามโอน Weekly" / "ติดตามโอน Daily เทียบสูญเสีย") — one row per
 * (date, origin, dest, product group[, price]), scoped to a single
 * channel's own plan/diff/% columns. Mounted at 3 routes with a different
 * `channel` (weekly/daily/total) rather than 3 separate files, since the
 * table shape is identical and only which stored field it reads differs.
 */
export default function TrackingChannel({ channel, title, productLine = 'chicken' }: TrackingChannelProps) {
  const [weekId, setWeekId] = useDefaultedWeekId(productLine);
  const [filter, setFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const { data, isLoading } = useTrackingResults(weekId);
  const { data: weeks } = useWeeks(productLine);
  const thresholds = useStatusThresholds();
  const rows = data ?? [];
  const [exporting, setExporting] = useState(false);

  const week = weeks?.find((w) => w.id === weekId);

  async function handleExport() {
    if (!weekId || !week) return;
    setExporting(true);
    try {
      await exportWeekToExcel(weekId, week.label, rows);
    } finally {
      setExporting(false);
    }
  }

  const planField = PLAN_FIELD[channel];
  const diffField = DIFF_FIELD[channel];
  const pctField = PCT_FIELD[channel];

  // Weekly/Daily scope the whole page to routes actually covered by that
  // plan source — a route whose plan came entirely from the other file is
  // irrelevant noise here, even though it's a real tracking_results row
  // (the รวม/Total tab and Dashboard still show every row, combined).
  const channelRows = useMemo(() => {
    if (channel === 'weekly') return rows.filter((r) => Number(r.plan_weekly) > 0);
    if (channel === 'daily') return rows.filter((r) => Number(r.plan_daily) > 0);
    return rows;
  }, [rows, channel]);

  const options = useMemo(() => routeFilterOptions(channelRows, pickRoute), [channelRows]);
  const filtered = channelRows.filter((r) => matchesRouteFilter(filter, pickRoute(r)));

  // Grand totals for whatever rows are currently filtered/visible — shown
  // pinned to the top of each metric's own column, like the source
  // workbook's PivotTable grand-total row, instead of a separate strip that
  // would drift out of alignment once the table scrolls horizontally.
  const totals = useMemo(() => {
    const agg = aggregateChannel(filtered, channel);
    return {
      plan: formatKg(agg.planSum),
      actual: formatKg(dedupedActualTotal(filtered)),
      diff: formatKg(agg.diff),
      diffTone: agg.diff < 0 ? ('bad' as const) : agg.diff > 0 ? ('good' as const) : undefined,
      pct: formatPct(agg.pct),
      profitRealized: formatBaht(sum(filtered.map((r) => Number(r.profit_realized)))),
      profitLost: (() => {
        const value = sum(filtered.map((r) => Number(r.profit_lost)));
        return { text: formatBaht(value), tone: value < 0 ? ('bad' as const) : undefined };
      })(),
    };
  }, [filtered, channel]);

  const columns: Column<TrackingResultRow>[] = useMemo(
    () => [
      {
        key: 'production_date',
        label: 'วันที่',
        pin: true,
        group: ROUTE_GROUP,
        sortValue: (r) => r.production_date,
        render: (r) => r.production_date,
      },
      {
        key: 'status',
        label: 'สถานะ',
        pin: true,
        group: ROUTE_GROUP,
        sortValue: (r) => r[pctField] as number | null,
        render: (r) =>
          thresholds ? <StatusBadge pct={r[pctField] as number | null} thresholds={thresholds} /> : null,
      },
      {
        key: 'origin',
        label: 'ต้นทาง',
        pin: true,
        group: ROUTE_GROUP,
        sortValue: (r) => r.origin_name,
        render: (r) => <CodeName code={r.origin_code} name={r.origin_name} />,
      },
      {
        key: 'dest',
        label: 'ปลายทาง',
        pin: true,
        group: ROUTE_GROUP,
        sortValue: (r) => r.dest_name,
        render: (r) => <CodeName code={r.dest_code} name={r.dest_name} />,
      },
      {
        key: 'product_group',
        label: 'กลุ่มสินค้า',
        pin: true,
        group: ROUTE_GROUP,
        sortValue: (r) => r.product_group,
        render: (r) => r.product_group,
      },
      {
        key: 'origin_code',
        label: 'รหัสต้นทาง',
        group: ROUTE_GROUP,
        sortValue: (r) => r.origin_code,
        render: (r) => r.origin_code,
      },
      {
        key: 'dest_code',
        label: 'รหัสปลายทาง',
        group: ROUTE_GROUP,
        sortValue: (r) => r.dest_code,
        render: (r) => r.dest_code,
      },
      {
        key: 'origin_price',
        label: 'ราคาต้นทาง',
        align: 'right',
        group: ROUTE_GROUP,
        sortValue: (r) => r.origin_price,
        render: (r) => r.origin_price.toLocaleString('en-US'),
      },
      {
        key: 'dest_price',
        label: 'ราคาปลายทาง',
        align: 'right',
        group: ROUTE_GROUP,
        sortValue: (r) => r.dest_price,
        render: (r) => r.dest_price.toLocaleString('en-US'),
      },
      {
        key: 'plan',
        label: PLAN_LABEL[channel],
        align: 'right',
        group: PLAN_GROUP,
        total: totals.plan,
        sortValue: (r) => Number(r[planField]),
        render: (r) => formatKg(Number(r[planField])),
      },
      {
        key: 'actual_total',
        label: 'โอนจริงทั้งหมด',
        align: 'right',
        group: ACTUAL_GROUP,
        total: totals.actual,
        sortValue: (r) => r.actual_total,
        render: (r) => formatKg(r.actual_total),
      },
      {
        key: 'diff',
        label: 'Diff แผนโอน',
        align: 'right',
        group: DIFF_GROUP,
        total: totals.diff,
        totalTone: totals.diffTone,
        sortValue: (r) => Number(r[diffField]),
        render: (r) => {
          const diff = Number(r[diffField]);
          return <span className={diffToneClass(diff)}>{formatKg(diff)}</span>;
        },
      },
      {
        key: 'pct',
        label: '% โอนเทียบแผน',
        align: 'right',
        group: PCT_GROUP,
        total: totals.pct,
        sortValue: (r) => r[pctField] as number | null,
        render: (r) => (thresholds ? <PctBar pct={r[pctField] as number | null} thresholds={thresholds} /> : formatPct(r[pctField] as number | null)),
      },
      {
        key: 'profit_realized',
        label: 'กำไรที่ได้',
        align: 'right',
        group: PROFIT_GROUP,
        total: totals.profitRealized,
        totalTone: 'good',
        sortValue: (r) => r.profit_realized,
        render: (r) => formatBaht(r.profit_realized),
      },
      {
        key: 'profit_lost',
        label: 'สูญเสียกำไร',
        align: 'right',
        group: LOSS_GROUP,
        total: totals.profitLost.text,
        totalTone: totals.profitLost.tone,
        sortValue: (r) => r.profit_lost,
        render: (r) => <span className={r.profit_lost < 0 ? 'text-red-600' : ''}>{formatBaht(r.profit_lost)}</span>,
      },
      {
        key: 'remark',
        label: 'หมายเหตุ',
        group: REMARK_GROUP,
        sortValue: (r) => r.remark,
        render: (r) => <RemarkCell id={r.id} value={r.remark} />,
      },
    ],
    [channel, planField, diffField, pctField, thresholds, totals],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">{title}</h1>
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
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
          <RouteFilterBar value={filter} onChange={setFilter} options={options} resultCount={filtered.length} />
          <SortableTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            defaultSortKey="production_date"
            storageKey={`columnWidths:tracking-${productLine}-${channel}`}
            columnVisibilityKey={`columnVisibility:tracking-${productLine}-${channel}`}
          />
        </>
      )}
    </div>
  );
}
