import { useMemo, useState } from 'react';
import ClearFilterButton from '../components/ClearFilterButton';
import KpiCard, { formatPct } from '../components/KpiCard';
import LastUpdatedLabel from '../components/LastUpdatedLabel';
import RouteFilterBar, { EMPTY_ROUTE_FILTER, matchesRouteFilter, type RouteFilterValue } from '../components/RouteFilterBar';
import SortableTable, { type Column } from '../components/SortableTable';
import SupplyDailyDetailModal from '../components/SupplyDailyDetailModal';
import WeekSelector from '../components/WeekSelector';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useMasFactoryZones, useSupplyDailyResults } from '../hooks/useSupplyDailyResults';
import { useUploads } from '../hooks/useUploads';
import { lastUpdatedAt } from '../lib/lastUpdated';
import { computeSupplyDailyKpis, matchesException, type ExceptionKey } from '../lib/supplyDailyAggregate';
import type { ProductLine, SupplyDailyResultRow } from '../types/db';

/** Attaches an Excel-style header filter dropdown to every column — mirrors RawData.tsx's own helper (kept local per page, same as TrackingChannel's headerFilterFor). */
function attachHeaderFilters<T>(
  columns: Column<T>[],
  rows: T[],
  filters: Record<string, string>,
  setFilters: (updater: (prev: Record<string, string>) => Record<string, string>) => void,
): Column<T>[] {
  return columns.map((col) => {
    const values = new Set<string>();
    for (const row of rows) {
      const v = col.sortValue(row);
      if (v !== null && v !== '') values.add(String(v));
    }
    return {
      ...col,
      headerFilter: {
        value: filters[col.key] ?? '',
        onChange: (v: string) => setFilters((f) => ({ ...f, [col.key]: v })),
        options: Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        placeholder: 'ทั้งหมด',
      },
    };
  });
}

function applyColumnFilters<T>(rows: T[], columns: Column<T>[], filters: Record<string, string>): T[] {
  const active = Object.entries(filters).filter(([, v]) => v);
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([key, value]) => {
      const col = columns.find((c) => c.key === key);
      return col ? String(col.sortValue(row) ?? '') === value : true;
    }),
  );
}

function pickRoute(r: SupplyDailyResultRow) {
  return { searchText: `${r.origin_code} ${r.origin_name} ${r.product_group}` };
}

function statusLabel(r: SupplyDailyResultRow): string {
  const labels: string[] = [];
  if (r.origin_zone_unresolved || r.vendor_group_unresolved) labels.push('ไม่สามารถ Match ข้อมูลได้');
  if (!r.filed) labels.push('ไม่ได้กรอก');
  if (r.is_off_plan) labels.push('โอนนอกแผน');
  if (r.is_off_plan_off_zone > 0) labels.push('นอกแผนนอกโซน');
  if (r.is_priced_down_off_plan) labels.push('ลงราคาแล้วนอกแผน');
  if (r.is_low_bid_off_plan) labels.push('Bidding แล้วนอกระบบ');
  return labels.length > 0 ? labels.join(', ') : 'ปกติ';
}

/** Groups the calc engine's 7 fine-grained ExceptionKeys into the 4 severity buckets an operator actually triages by. */
interface ExceptionGroup {
  key: string;
  label: string;
  keys: ExceptionKey[];
  dot: string;
  activeRing: string;
}

const EXCEPTION_GROUPS: ExceptionGroup[] = [
  {
    key: 'off_plan',
    label: '🔴 โอนนอกแผน',
    keys: ['off_plan'],
    dot: 'bg-red-500',
    activeRing: 'border-red-500 bg-red-50 ring-1 ring-red-400',
  },
  {
    key: 'bidding_pricing_off_system',
    label: '🟠 Bidding / ลงราคา แต่ไม่เข้าระบบโอน',
    keys: ['low_bid_off_plan', 'priced_down_off_plan'],
    dot: 'bg-amber-500',
    activeRing: 'border-amber-500 bg-amber-50 ring-1 ring-amber-400',
  },
  {
    key: 'supply_no_plan',
    label: '🟡 มี Supply แต่ไม่มีแผนโอน',
    keys: ['supply_no_plan', 'plan_no_actual', 'actual_no_plan'],
    dot: 'bg-yellow-400',
    activeRing: 'border-yellow-500 bg-yellow-50 ring-1 ring-yellow-400',
  },
  {
    key: 'unresolved',
    label: '🟣 ข้อมูลไม่สมบูรณ์ / Match ไม่ได้',
    keys: ['unresolved'],
    dot: 'bg-purple-500',
    activeRing: 'border-purple-500 bg-purple-50 ring-1 ring-purple-400',
  },
];

function matchesExceptionGroup(row: SupplyDailyResultRow, group: ExceptionGroup): boolean {
  return group.keys.some((k) => matchesException(row, k));
}

interface ProcessStage {
  label: string;
  value: number;
}

interface SupplyDailyTrackingProps {
  productLine?: ProductLine;
}

export default function SupplyDailyTracking({ productLine = 'chicken' }: SupplyDailyTrackingProps) {
  const [weekId, setWeekId] = useDefaultedWeekId(productLine);
  const { data: results, isLoading } = useSupplyDailyResults(weekId);
  const { data: factoryZones } = useMasFactoryZones();
  const { data: uploads } = useUploads(weekId);

  const [routeFilter, setRouteFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<SupplyDailyResultRow | null>(null);

  const rows = results ?? [];

  const columnsBase: Column<SupplyDailyResultRow>[] = useMemo(
    () => [
      {
        key: 'production_date',
        label: 'วันที่',
        pin: true,
        sortValue: (r) => r.production_date,
        render: (r) => r.production_date,
      },
      { key: 'origin_code', label: 'รหัสโรงงาน', sortValue: (r) => r.origin_code, render: (r) => r.origin_code },
      { key: 'origin_name', label: 'โรงงาน', sortValue: (r) => r.origin_name, render: (r) => r.origin_name },
      { key: 'product_group', label: 'กลุ่มสินค้า', sortValue: (r) => r.product_group, render: (r) => r.product_group },
      {
        key: 'filed',
        label: 'กรอก Supply',
        sortValue: (r) => (r.filed ? 1 : 0),
        render: (r) => (r.filed ? '✓ กรอกแล้ว' : '✗ ไม่ได้กรอก'),
      },
      {
        key: 'remaining_qty',
        label: 'ปริมาณของเหลือ',
        align: 'right',
        sortValue: (r) => r.remaining_qty,
        render: (r) => r.remaining_qty.toLocaleString('en-US'),
      },
      {
        key: 'plan_out',
        label: 'แผนโอนออก',
        align: 'right',
        sortValue: (r) => r.plan_out,
        render: (r) => r.plan_out.toLocaleString('en-US'),
      },
      {
        key: 'actual_out',
        label: 'โอนออกจริง',
        align: 'right',
        sortValue: (r) => r.actual_out,
        render: (r) => r.actual_out.toLocaleString('en-US'),
      },
      {
        key: 'bidding_status',
        label: 'สถานะ Bidding',
        sortValue: (r) => (r.is_low_bid_off_plan ? 'มี Bidding นอกระบบ' : 'ปกติ'),
        render: (r) => (r.is_low_bid_off_plan ? 'มี Bidding นอกระบบ' : '-'),
      },
      {
        key: 'transfer_status',
        label: 'สถานะโอน',
        sortValue: (r) => (r.is_off_plan ? 'โอนนอกแผน' : ''),
        render: (r) => (r.is_off_plan ? 'โอนนอกแผน' : '-'),
      },
      {
        key: 'exception_status',
        label: 'Exception',
        sortValue: (r) => statusLabel(r),
        render: (r) => statusLabel(r),
      },
      {
        key: 'data_quality',
        label: 'Data Quality',
        sortValue: (r) => (r.origin_zone_unresolved || r.vendor_group_unresolved ? 'ไม่สามารถ Match ได้' : 'ปกติ'),
        render: (r) =>
          r.origin_zone_unresolved || r.vendor_group_unresolved ? (
            <span className="text-amber-600" title="โรงงานนี้ไม่มีใน Master Zone/Vendor Group — ตรวจสอบไม่ได้ครบ ไม่ใช่ค่า &quot;ปกติ&quot;">
              ⚠ ไม่สามารถ Match ได้
            </span>
          ) : (
            '-'
          ),
      },
    ],
    [],
  );

  // The single filter pipeline: search box + per-column header filters narrow
  // `searchFiltered`, which every KPI/Process/Exception count below is
  // computed from — clicking an exception-group tile then narrows the table
  // further without shrinking the other tiles' own counts.
  const searchFiltered = useMemo(
    () => applyColumnFilters(rows.filter((r) => matchesRouteFilter(routeFilter, pickRoute(r))), columnsBase, columnFilters),
    [rows, routeFilter, columnsBase, columnFilters],
  );

  const activeGroup = EXCEPTION_GROUPS.find((g) => g.key === activeGroupKey) ?? null;
  const finalRows = activeGroup ? searchFiltered.filter((r) => matchesExceptionGroup(r, activeGroup)) : searchFiltered;

  const columns = useMemo(
    () => attachHeaderFilters(columnsBase, rows.filter((r) => matchesRouteFilter(routeFilter, pickRoute(r))), columnFilters, setColumnFilters),
    [columnsBase, rows, routeFilter, columnFilters],
  );

  const kpis = computeSupplyDailyKpis(searchFiltered, factoryZones?.length ?? 0);

  const processStages: ProcessStage[] = [
    { label: 'Supply Daily', value: kpis.filedRowCount },
    { label: 'Bidding', value: kpis.biddingRecordCount },
    { label: 'ลงราคา', value: kpis.pricedDownRecordCount },
    { label: 'แผนโอน', value: kpis.planRecordCount },
    { label: 'โอนจริง', value: kpis.actualRecordCount },
  ];

  const groupCounts = new Map(EXCEPTION_GROUPS.map((g) => [g.key, searchFiltered.filter((r) => matchesExceptionGroup(r, g)).length]));

  const filtersActive = routeFilter.search !== '' || Object.values(columnFilters).some(Boolean) || activeGroupKey !== null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">ติดตามการกรอก Supply Daily</h1>
        <div className="flex flex-wrap items-center gap-3">
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
          <LastUpdatedLabel at={lastUpdatedAt(uploads)} />
        </div>
      </div>

      {!weekId && <p className="text-sm text-gray-500">เลือก Week เพื่อดูข้อมูล</p>}
      {weekId && isLoading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      {weekId && !isLoading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="จำนวนโรงงานทั้งหมด" value={String(kpis.totalFactories)} />
            <KpiCard label="โรงงานที่กรอก Supply" value={String(kpis.filedFactories)} sub={formatPct(kpis.filedPct)} />
            <KpiCard
              label="% Bidding เข้าระบบโอน"
              value={formatPct(kpis.biddingEnteredSystemPct)}
              tone={kpis.biddingEnteredSystemPct !== null && kpis.biddingEnteredSystemPct < 1 ? 'warn' : 'default'}
            />
            <KpiCard
              label="โอนนอกแผน"
              value={String(kpis.offPlanCount)}
              sub={formatPct(searchFiltered.length > 0 ? kpis.offPlanCount / searchFiltered.length : null)}
              tone={kpis.offPlanCount > 0 ? 'bad' : 'default'}
            />
            <KpiCard
              label="โอนนอกแผนนอกโซน"
              value={String(kpis.offPlanOffZoneCount)}
              tone={kpis.offPlanOffZoneCount > 0 ? 'bad' : 'default'}
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">ภาพรวมกระบวนการ</h2>
            <div className="flex flex-wrap items-center gap-2">
              {processStages.map((stage, i) => (
                <div key={stage.label} className="flex items-center gap-2">
                  <div className="min-w-[104px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <p className="text-xs text-gray-500">{stage.label}</p>
                    <p className="text-lg font-semibold tabular-nums text-navy-900">{stage.value.toLocaleString('en-US')}</p>
                  </div>
                  {i < processStages.length - 1 && <span className="text-gray-300">▶</span>}
                </div>
              ))}
              <span className="ml-2 text-xs text-gray-400">
                % เข้าระบบโอน (Bidding → แผนโอน): {formatPct(kpis.biddingEnteredSystemPct)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Exception / รายการที่ต้องติดตาม</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {EXCEPTION_GROUPS.map((group) => {
                const count = groupCounts.get(group.key) ?? 0;
                const active = activeGroupKey === group.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setActiveGroupKey((prev) => (prev === group.key ? null : group.key))}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      active ? group.activeRing : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${group.dot}`} />
                      <span className={`text-2xl font-semibold tabular-nums ${count > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                        {count}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">{group.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <SortableTable
            rows={finalRows}
            columns={columns}
            rowKey={(r) => r.id}
            defaultSortKey="production_date"
            storageKey={`columnWidths:supply-daily-${productLine}`}
            columnVisibilityKey={`columnVisibility:supply-daily-${productLine}`}
            filterBar={<RouteFilterBar value={routeFilter} onChange={setRouteFilter} resultCount={finalRows.length} />}
            onRowClick={setSelectedRow}
            headerExtra={
              <ClearFilterButton
                active={filtersActive}
                onClear={() => {
                  setRouteFilter(EMPTY_ROUTE_FILTER);
                  setColumnFilters({});
                  setActiveGroupKey(null);
                }}
              />
            }
          />
        </>
      )}

      {selectedRow && <SupplyDailyDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
