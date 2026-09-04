import { useMemo, useState } from 'react';
import CodeName from '../components/CodeName';
import { formatBaht, formatKg, formatPct } from '../components/KpiCard';
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
import { exportWeekToExcel } from '../lib/exportExcel';
import type { TrackingResultRow } from '../types/db';

export type Channel = 'weekly' | 'daily' | 'total';

interface TrackingChannelProps {
  channel: Channel;
  title: string;
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
  weekly: 'แผนโอน Weekly (kg)',
  daily: 'แผนโอน Daily (kg)',
  total: 'แผนโอนรวม (kg)',
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

/**
 * Mirrors the original workbook's per-channel tracking sheets
 * ("ติดตามโอน Weekly" / "ติดตามโอน Daily เทียบสูญเสีย") — one row per
 * (date, origin, dest, product group[, price]), scoped to a single
 * channel's own plan/diff/% columns. Mounted at 3 routes with a different
 * `channel` (weekly/daily/total) rather than 3 separate files, since the
 * table shape is identical and only which stored field it reads differs.
 */
export default function TrackingChannel({ channel, title }: TrackingChannelProps) {
  const [weekId, setWeekId] = useDefaultedWeekId();
  const [filter, setFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const { data, isLoading } = useTrackingResults(weekId);
  const { data: weeks } = useWeeks();
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

  const columns: Column<TrackingResultRow>[] = useMemo(
    () => [
      {
        key: 'production_date',
        label: 'วันที่',
        pin: true,
        sortValue: (r) => r.production_date,
        render: (r) => r.production_date,
      },
      {
        key: 'status',
        label: 'สถานะ',
        sortValue: (r) => r[pctField] as number | null,
        render: (r) =>
          thresholds ? <StatusBadge pct={r[pctField] as number | null} thresholds={thresholds} /> : null,
      },
      {
        key: 'origin',
        label: 'ต้นทาง',
        sortValue: (r) => r.origin_name,
        render: (r) => <CodeName code={r.origin_code} name={r.origin_name} />,
      },
      {
        key: 'dest',
        label: 'ปลายทาง',
        sortValue: (r) => r.dest_name,
        render: (r) => <CodeName code={r.dest_code} name={r.dest_name} />,
      },
      { key: 'product_group', label: 'กลุ่มสินค้า', sortValue: (r) => r.product_group, render: (r) => r.product_group },
      {
        key: 'origin_price',
        label: 'ราคาต้นทาง',
        align: 'right',
        sortValue: (r) => r.origin_price,
        render: (r) => r.origin_price.toLocaleString('en-US'),
      },
      {
        key: 'dest_price',
        label: 'ราคาปลายทาง',
        align: 'right',
        sortValue: (r) => r.dest_price,
        render: (r) => r.dest_price.toLocaleString('en-US'),
      },
      {
        key: 'plan',
        label: PLAN_LABEL[channel],
        align: 'right',
        sortValue: (r) => Number(r[planField]),
        render: (r) => formatKg(Number(r[planField])),
      },
      {
        key: 'actual_total',
        label: 'โอนจริงทั้งหมด (kg)',
        align: 'right',
        sortValue: (r) => r.actual_total,
        render: (r) => formatKg(r.actual_total),
      },
      {
        key: 'diff',
        label: 'Diff แผนโอน (kg)',
        align: 'right',
        sortValue: (r) => Number(r[diffField]),
        render: (r) => formatKg(Number(r[diffField])),
      },
      {
        key: 'pct',
        label: '% โอนเทียบแผน',
        align: 'right',
        sortValue: (r) => r[pctField] as number | null,
        render: (r) => formatPct(r[pctField] as number | null),
      },
      {
        key: 'profit_realized',
        label: 'กำไรที่ได้ (บาท)',
        align: 'right',
        sortValue: (r) => r.profit_realized,
        render: (r) => formatBaht(r.profit_realized),
      },
      {
        key: 'profit_lost',
        label: 'สูญเสียกำไร (บาท)',
        align: 'right',
        sortValue: (r) => r.profit_lost,
        render: (r) => <span className={r.profit_lost < 0 ? 'text-red-600' : ''}>{formatBaht(r.profit_lost)}</span>,
      },
      {
        key: 'remark',
        label: 'หมายเหตุ',
        sortValue: (r) => r.remark,
        render: (r) => <RemarkCell id={r.id} value={r.remark} />,
      },
    ],
    [channel, planField, diffField, pctField, thresholds],
  );

  const options = useMemo(() => routeFilterOptions(rows, pickRoute), [rows]);
  const filtered = rows.filter((r) => matchesRouteFilter(filter, pickRoute(r)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">{title}</h1>
          <WeekSelector value={weekId} onChange={setWeekId} />
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
          <SortableTable rows={filtered} columns={columns} rowKey={(r) => r.id} defaultSortKey="production_date" />
        </>
      )}
    </div>
  );
}
