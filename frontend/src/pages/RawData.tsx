import { useEffect, useMemo, useState } from 'react';
import ClearFilterButton from '../components/ClearFilterButton';
import { formatKg } from '../components/KpiCard';
import LastUpdatedLabel from '../components/LastUpdatedLabel';
import RouteFilterBar, { EMPTY_ROUTE_FILTER, matchesRouteFilter, type RouteFilterValue } from '../components/RouteFilterBar';
import SortableTable, { type Column } from '../components/SortableTable';
import WeekSelector from '../components/WeekSelector';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useRawActualRows, useRawPlanRows, type RawActualRow, type RawPlanRow } from '../hooks/useRawRows';
import { useUploads } from '../hooks/useUploads';
import { sum } from '../lib/aggregate';
import { ACTUAL_REQUIRED_COLUMNS, PLAN_REQUIRED_COLUMNS } from '../lib/excelParser';
import { lastUpdatedAt } from '../lib/lastUpdated';
import type { ProductLine } from '../types/db';

// Rows uploaded before `raw` captured the full original file still hold the
// old reduced object (this app's own internal field names, camelCase) — a
// week that hasn't been re-uploaded since would otherwise show every one of
// these as a fake "extra" column duplicating the named column next to it.
// Excluding them too means an un-re-uploaded week just shows no extra
// columns (accurate: we don't have the rest of that file) instead of noise.
const LEGACY_ACTUAL_RAW_KEYS = [
  'originCode', 'originName', 'destCode', 'destName', 'transferDate', 'skuCode', 'skuName', 'weightKg', 'productGroup',
] as const;
const LEGACY_PLAN_RAW_KEYS = [
  'sourceFile', 'productionDate', 'originCode', 'originName', 'destCode', 'destName', 'productGroup', 'originPrice', 'destPrice', 'suggest', 'supplyAfter',
] as const;

/**
 * One column per header in the source Excel file that this app doesn't
 * already parse into a named field — reusing whatever columns the upload
 * happened to have (order of first appearance), so ข้อมูลดิบ shows the
 * complete original row, not just the subset the tracking calc needs.
 * `raw` is null for rows uploaded before this was captured.
 */
function extraRawColumns<T extends { raw: Record<string, unknown> | null }>(
  rows: T[],
  parsedColumns: readonly string[],
): Column<T>[] {
  const exclude = new Set<string>(parsedColumns);
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    if (!row.raw) continue;
    for (const key of Object.keys(row.raw)) {
      if (exclude.has(key) || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.map((key) => {
    const sample = rows.find((r) => r.raw && r.raw[key] !== null && r.raw[key] !== undefined)?.raw?.[key];
    const isNumeric = typeof sample === 'number';
    return {
      key: `raw:${key}`,
      label: key,
      align: isNumeric ? 'right' : undefined,
      sortValue: (r) => {
        const v = r.raw?.[key];
        if (typeof v === 'number') return v;
        return v === null || v === undefined || v === '' ? null : String(v);
      },
      render: (r) => {
        const v = r.raw?.[key];
        if (v === null || v === undefined || v === '') return '';
        return typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
      },
    };
  });
}

/** Attaches an Excel-style header filter dropdown to every column, reusing each column's own `sortValue` as the filter's value accessor so there's only one place (per column) that defines what a field "is". */
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

/** Rows matching every active header-filter dropdown, checked against the same `sortValue` the filter's own options were built from. */
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

type Tab = 'actual' | 'plan';

function pickActualRoute(r: RawActualRow) {
  return { searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group} ${r.sku_code} ${r.sku_name}` };
}

function pickPlanRoute(r: RawPlanRow) {
  return { searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group}` };
}

const tabClass = (active: boolean) =>
  `border-b-2 px-3 py-2 text-sm font-medium ${
    active ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500 hover:text-gray-700'
  }`;

interface RawDataProps {
  productLine?: ProductLine;
}

export default function RawData({ productLine = 'chicken' }: RawDataProps) {
  const [weekId, setWeekId] = useDefaultedWeekId(productLine);
  const [tab, setTab] = useState<Tab>('actual');
  const [actualFilter, setActualFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const [planFilter, setPlanFilter] = useState<RouteFilterValue>(EMPTY_ROUTE_FILTER);
  const [actualColumnFilters, setActualColumnFilters] = useState<Record<string, string>>({});
  const [planColumnFilters, setPlanColumnFilters] = useState<Record<string, string>>({});
  const { data: uploads } = useUploads(weekId);

  // A filter set on one Week must not silently keep filtering a different
  // Week's data once selected — the header dropdown would even show
  // "ทั้งหมด" again (its old value isn't among the new Week's options),
  // making the leftover filter invisible while it's still excluding rows.
  useEffect(() => {
    setActualFilter(EMPTY_ROUTE_FILTER);
    setPlanFilter(EMPTY_ROUTE_FILTER);
    setActualColumnFilters({});
    setPlanColumnFilters({});
  }, [weekId]);

  const actual = useRawActualRows(weekId);
  const plan = useRawPlanRows(weekId);

  const actualRows = actual.data ?? [];
  const planRows = plan.data ?? [];

  const filteredActual = actualRows.filter((r) => matchesRouteFilter(actualFilter, pickActualRoute(r)));
  const filteredPlan = planRows.filter((r) => matchesRouteFilter(planFilter, pickPlanRoute(r)));

  // Grand totals pinned above their own column (see DrilldownTable/TrackingChannel for the same pattern) instead of a separate strip that would drift out of alignment on horizontal scroll.
  const actualColumnsBase: Column<RawActualRow>[] = useMemo(
    () => [
      { key: 'transfer_date', label: 'วันที่โอน', sortValue: (r) => r.transfer_date, render: (r) => r.transfer_date },
      { key: 'origin_code', label: 'รหัสต้นทาง', sortValue: (r) => r.origin_code, render: (r) => r.origin_code },
      { key: 'origin', label: 'ต้นทาง', sortValue: (r) => r.origin_name, render: (r) => r.origin_name },
      { key: 'dest_code', label: 'รหัสปลายทาง', sortValue: (r) => r.dest_code, render: (r) => r.dest_code },
      { key: 'dest', label: 'ปลายทาง', sortValue: (r) => r.dest_name, render: (r) => r.dest_name },
      { key: 'sku_code', label: 'รหัสสินค้า', sortValue: (r) => r.sku_code, render: (r) => r.sku_code },
      { key: 'sku', label: 'สินค้า', sortValue: (r) => r.sku_name, render: (r) => r.sku_name },
      { key: 'product_group', label: 'กลุ่มสินค้า (P19)', sortValue: (r) => r.product_group, render: (r) => r.product_group },
      {
        key: 'weight_kg',
        label: 'น้ำหนัก',
        align: 'right',
        total: formatKg(sum(filteredActual.map((r) => r.weight_kg))),
        sortValue: (r) => r.weight_kg,
        render: (r) => r.weight_kg.toLocaleString('en-US'),
      },
      ...extraRawColumns(filteredActual, [...ACTUAL_REQUIRED_COLUMNS, ...LEGACY_ACTUAL_RAW_KEYS]),
    ],
    [filteredActual],
  );
  const finalActual = useMemo(
    () => applyColumnFilters(filteredActual, actualColumnsBase, actualColumnFilters),
    [filteredActual, actualColumnsBase, actualColumnFilters],
  );
  const actualColumns = useMemo(
    () => attachHeaderFilters(actualColumnsBase, filteredActual, actualColumnFilters, setActualColumnFilters),
    [actualColumnsBase, filteredActual, actualColumnFilters],
  );

  const planColumnsBase: Column<RawPlanRow>[] = useMemo(
    () => [
      {
        key: 'source_file',
        label: 'ประเภท',
        sortValue: (r) => r.source_file,
        render: (r) => (r.source_file === 'weekly' ? 'Weekly' : 'Daily'),
      },
      { key: 'production_date', label: 'วันที่', sortValue: (r) => r.production_date, render: (r) => r.production_date },
      { key: 'origin_code', label: 'รหัสต้นทาง', sortValue: (r) => r.origin_code, render: (r) => r.origin_code },
      { key: 'origin', label: 'ต้นทาง', sortValue: (r) => r.origin_name, render: (r) => r.origin_name },
      { key: 'dest_code', label: 'รหัสปลายทาง', sortValue: (r) => r.dest_code, render: (r) => r.dest_code },
      { key: 'dest', label: 'ปลายทาง', sortValue: (r) => r.dest_name, render: (r) => r.dest_name },
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
        key: 'suggest',
        label: 'Suggest',
        align: 'right',
        total: formatKg(sum(filteredPlan.map((r) => r.suggest))),
        sortValue: (r) => r.suggest,
        render: (r) => r.suggest.toLocaleString('en-US'),
      },
      {
        key: 'supply_after',
        label: 'แผนสุดท้าย',
        align: 'right',
        total: formatKg(sum(filteredPlan.map((r) => r.supply_after))),
        sortValue: (r) => r.supply_after,
        render: (r) => r.supply_after.toLocaleString('en-US'),
      },
      ...extraRawColumns(filteredPlan, [...PLAN_REQUIRED_COLUMNS, ...LEGACY_PLAN_RAW_KEYS]),
    ],
    [filteredPlan],
  );
  const finalPlan = useMemo(
    () => applyColumnFilters(filteredPlan, planColumnsBase, planColumnFilters),
    [filteredPlan, planColumnsBase, planColumnFilters],
  );
  const planColumns = useMemo(
    () => attachHeaderFilters(planColumnsBase, filteredPlan, planColumnFilters, setPlanColumnFilters),
    [planColumnsBase, filteredPlan, planColumnFilters],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">ข้อมูลดิบ</h1>
        <div className="flex flex-wrap items-center gap-3">
          <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
          <LastUpdatedLabel at={lastUpdatedAt(uploads)} />
        </div>
      </div>

      {!weekId && <p className="text-sm text-gray-500">เลือก Week เพื่อดูข้อมูล</p>}

      {weekId && (
        <>
          <div className="flex gap-2 border-b border-gray-200">
            <button type="button" onClick={() => setTab('actual')} className={tabClass(tab === 'actual')}>
              โอนจริง (ABS0000){actual.data ? ` — ${actual.data.length} แถว` : ''}
            </button>
            <button type="button" onClick={() => setTab('plan')} className={tabClass(tab === 'plan')}>
              {productLine === 'pork' ? 'แผนโอน Daily' : 'แผนโอน Weekly-Daily'}
              {plan.data ? ` — ${plan.data.length} แถว` : ''}
            </button>
          </div>

          {tab === 'actual' &&
            (actual.isLoading ? (
              <p className="text-sm text-gray-500">กำลังโหลด...</p>
            ) : (
              <SortableTable
                rows={finalActual}
                columns={actualColumns}
                rowKey={(r) => r.id}
                defaultSortKey="transfer_date"
                storageKey={`columnWidths:rawdata-${productLine}-actual`}
                columnVisibilityKey={`columnVisibility:rawdata-${productLine}-actual`}
                filterBar={
                  <RouteFilterBar value={actualFilter} onChange={setActualFilter} resultCount={finalActual.length} />
                }
                headerExtra={
                  <ClearFilterButton
                    active={actualFilter.search !== '' || Object.values(actualColumnFilters).some(Boolean)}
                    onClear={() => {
                      setActualFilter(EMPTY_ROUTE_FILTER);
                      setActualColumnFilters({});
                    }}
                  />
                }
              />
            ))}

          {tab === 'plan' &&
            (plan.isLoading ? (
              <p className="text-sm text-gray-500">กำลังโหลด...</p>
            ) : (
              <SortableTable
                rows={finalPlan}
                columns={planColumns}
                rowKey={(r) => r.id}
                defaultSortKey="production_date"
                storageKey={`columnWidths:rawdata-${productLine}-plan`}
                columnVisibilityKey={`columnVisibility:rawdata-${productLine}-plan`}
                filterBar={
                  <RouteFilterBar value={planFilter} onChange={setPlanFilter} resultCount={finalPlan.length} />
                }
                headerExtra={
                  <ClearFilterButton
                    active={planFilter.search !== '' || Object.values(planColumnFilters).some(Boolean)}
                    onClear={() => {
                      setPlanFilter(EMPTY_ROUTE_FILTER);
                      setPlanColumnFilters({});
                    }}
                  />
                }
              />
            ))}
        </>
      )}
    </div>
  );
}
