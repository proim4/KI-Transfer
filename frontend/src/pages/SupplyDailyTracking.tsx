import { useMemo, useState } from 'react';
import ClearFilterButton from '../components/ClearFilterButton';
import KpiCard, { formatPct } from '../components/KpiCard';
import LastUpdatedLabel from '../components/LastUpdatedLabel';
import RouteFilterBar, { EMPTY_ROUTE_FILTER, matchesRouteFilter, type RouteFilterValue } from '../components/RouteFilterBar';
import SortableTable, { type Column } from '../components/SortableTable';
import WeekSelector from '../components/WeekSelector';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useMasFactoryZones, useSupplyDailyResults } from '../hooks/useSupplyDailyResults';
import { useUploads } from '../hooks/useUploads';
import { lastUpdatedAt } from '../lib/lastUpdated';
import {
  EXCEPTION_LABELS,
  computeSupplyDailyKpis,
  matchesException,
  type ExceptionKey,
} from '../lib/supplyDailyAggregate';
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
  const [activeException, setActiveException] = useState<ExceptionKey | null>(null);

  const rows = results ?? [];
  const kpis = computeSupplyDailyKpis(rows, factoryZones?.length ?? 0);

  const exceptionFiltered = activeException ? rows.filter((r) => matchesException(r, activeException)) : rows;
  const routeFiltered = exceptionFiltered.filter((r) => matchesRouteFilter(routeFilter, pickRoute(r)));

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

  const finalRows = useMemo(
    () => applyColumnFilters(routeFiltered, columnsBase, columnFilters),
    [routeFiltered, columnsBase, columnFilters],
  );
  const columns = useMemo(
    () => attachHeaderFilters(columnsBase, routeFiltered, columnFilters, setColumnFilters),
    [columnsBase, routeFiltered, columnFilters],
  );

  const exceptionCards: { key: ExceptionKey; count: number }[] = [
    { key: 'low_bid_off_plan', count: kpis.lowBidOffPlanCount },
    { key: 'priced_down_off_plan', count: kpis.pricedDownOffPlanCount },
    { key: 'actual_no_plan', count: kpis.actualNoPlanCount },
    { key: 'supply_no_plan', count: kpis.supplyNoPlanCount },
    { key: 'plan_no_actual', count: kpis.planNoActualCount },
    { key: 'off_plan', count: kpis.offPlanCount },
    { key: 'unresolved', count: kpis.unresolvedCount },
  ];

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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="จำนวนโรงงานทั้งหมด" value={String(kpis.totalFactories)} />
            <KpiCard label="โรงงานที่กรอก Supply" value={String(kpis.filedFactories)} sub={`${formatPct(kpis.filedPct)}`} />
            <KpiCard
              label="โอนนอกแผน"
              value={String(kpis.offPlanCount)}
              sub={`${formatPct(rows.length > 0 ? kpis.offPlanCount / rows.length : null)}`}
              tone={kpis.offPlanCount > 0 ? 'bad' : 'default'}
            />
            <KpiCard
              label="โอนนอกแผนนอกโซน"
              value={String(kpis.offPlanOffZoneCount)}
              tone={kpis.offPlanOffZoneCount > 0 ? 'bad' : 'default'}
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              ภาพรวมกระบวนการ Supply → Bidding → ลงราคา → แผนโอน → โอนจริง
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-4">
              <KpiCard label="ปริมาณ Supply ทั้งหมด" value={kpis.totalSupplyQty.toLocaleString('en-US')} />
              <KpiCard label="จำนวนรายการ Bidding" value={String(kpis.biddingRecordCount)} />
              <KpiCard label="จำนวนรายการลงราคา" value={String(kpis.pricedDownRecordCount)} />
              <KpiCard label="จำนวนรายการมีแผนโอน" value={String(kpis.planRecordCount)} />
              <KpiCard label="จำนวนรายการมีโอนจริง" value={String(kpis.actualRecordCount)} />
              <KpiCard
                label="% Bidding เข้าระบบโอน"
                value={formatPct(kpis.biddingEnteredSystemPct)}
                tone={kpis.biddingEnteredSystemPct !== null && kpis.biddingEnteredSystemPct < 1 ? 'warn' : 'default'}
              />
              <KpiCard
                label="% Bidding ไม่เข้าระบบโอน"
                value={formatPct(kpis.biddingNotEnteredSystemPct)}
                tone={kpis.biddingNotEnteredSystemPct !== null && kpis.biddingNotEnteredSystemPct > 0 ? 'bad' : 'default'}
              />
              <KpiCard label="% โอนตามแผน" value={formatPct(kpis.onPlanPct)} tone="good" />
              <KpiCard
                label="% โอนนอกแผน"
                value={formatPct(kpis.offPlanPct)}
                tone={kpis.offPlanPct !== null && kpis.offPlanPct > 0 ? 'bad' : 'default'}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">🚨 Exception</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
              {exceptionCards.map(({ key, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveException((prev) => (prev === key ? null : key))}
                  className={`rounded-md border p-2 text-left text-xs transition-colors ${
                    activeException === key
                      ? 'border-navy-600 bg-navy-50 ring-1 ring-navy-400'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-lg font-semibold ${count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{count}</div>
                  <div className="text-gray-600">{EXCEPTION_LABELS[key]}</div>
                </button>
              ))}
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
            headerExtra={
              <ClearFilterButton
                active={routeFilter.search !== '' || Object.values(columnFilters).some(Boolean) || activeException !== null}
                onClear={() => {
                  setRouteFilter(EMPTY_ROUTE_FILTER);
                  setColumnFilters({});
                  setActiveException(null);
                }}
              />
            }
          />
        </>
      )}
    </div>
  );
}
