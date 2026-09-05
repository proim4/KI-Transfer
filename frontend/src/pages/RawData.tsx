import { useMemo, useState } from 'react';
import CodeName from '../components/CodeName';
import { formatKg } from '../components/KpiCard';
import RouteFilterBar, { EMPTY_ROUTE_FILTER, matchesRouteFilter, routeFilterOptions, type RouteFilterValue } from '../components/RouteFilterBar';
import SortableTable, { type Column } from '../components/SortableTable';
import WeekSelector from '../components/WeekSelector';
import { useDefaultedWeekId } from '../hooks/useDefaultedWeekId';
import { useRawActualRows, useRawPlanRows, type RawActualRow, type RawPlanRow } from '../hooks/useRawRows';
import { sum } from '../lib/aggregate';
import type { ProductLine } from '../types/db';

type Tab = 'actual' | 'plan';

function pickActualRoute(r: RawActualRow) {
  return {
    date: r.transfer_date,
    origin: r.origin_name,
    dest: r.dest_name,
    productGroup: r.product_group,
    searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group} ${r.sku_code} ${r.sku_name}`,
  };
}

function pickPlanRoute(r: RawPlanRow) {
  return {
    date: r.production_date,
    origin: r.origin_name,
    dest: r.dest_name,
    productGroup: r.product_group,
    searchText: `${r.origin_code} ${r.origin_name} ${r.dest_code} ${r.dest_name} ${r.product_group}`,
  };
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

  const actual = useRawActualRows(weekId);
  const plan = useRawPlanRows(weekId);

  const actualRows = actual.data ?? [];
  const planRows = plan.data ?? [];

  const actualOptions = useMemo(() => routeFilterOptions(actualRows, pickActualRoute), [actualRows]);
  const planOptions = useMemo(() => routeFilterOptions(planRows, pickPlanRoute), [planRows]);

  const filteredActual = actualRows.filter((r) => matchesRouteFilter(actualFilter, pickActualRoute(r)));
  const filteredPlan = planRows.filter((r) => matchesRouteFilter(planFilter, pickPlanRoute(r)));

  // Grand totals pinned above their own column (see DrilldownTable/TrackingChannel for the same pattern) instead of a separate strip that would drift out of alignment on horizontal scroll.
  const actualColumns: Column<RawActualRow>[] = useMemo(
    () => [
      { key: 'transfer_date', label: 'วันที่โอน', sortValue: (r) => r.transfer_date, render: (r) => r.transfer_date },
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
      {
        key: 'sku',
        label: 'สินค้า',
        sortValue: (r) => r.sku_name,
        render: (r) => <CodeName code={r.sku_code} name={r.sku_name} />,
      },
      { key: 'product_group', label: 'กลุ่มสินค้า (P19)', sortValue: (r) => r.product_group, render: (r) => r.product_group },
      {
        key: 'weight_kg',
        label: 'น้ำหนัก',
        align: 'right',
        total: formatKg(sum(filteredActual.map((r) => r.weight_kg))),
        sortValue: (r) => r.weight_kg,
        render: (r) => r.weight_kg.toLocaleString('en-US'),
      },
    ],
    [filteredActual],
  );

  const planColumns: Column<RawPlanRow>[] = useMemo(
    () => [
      {
        key: 'source_file',
        label: 'ประเภท',
        sortValue: (r) => r.source_file,
        render: (r) => (r.source_file === 'weekly' ? 'Weekly' : 'Daily'),
      },
      { key: 'production_date', label: 'วันที่', sortValue: (r) => r.production_date, render: (r) => r.production_date },
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
    ],
    [filteredPlan],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">ข้อมูลดิบ</h1>
        <WeekSelector value={weekId} onChange={setWeekId} productLine={productLine} />
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
              <>
                <RouteFilterBar
                  value={actualFilter}
                  onChange={setActualFilter}
                  options={actualOptions}
                  resultCount={filteredActual.length}
                />
                <SortableTable
                  rows={filteredActual}
                  columns={actualColumns}
                  rowKey={(r) => r.id}
                  defaultSortKey="transfer_date"
                  storageKey={`columnWidths:rawdata-${productLine}-actual`}
                  columnVisibilityKey={`columnVisibility:rawdata-${productLine}-actual`}
                />
              </>
            ))}

          {tab === 'plan' &&
            (plan.isLoading ? (
              <p className="text-sm text-gray-500">กำลังโหลด...</p>
            ) : (
              <>
                <RouteFilterBar
                  value={planFilter}
                  onChange={setPlanFilter}
                  options={planOptions}
                  resultCount={filteredPlan.length}
                />
                <SortableTable
                  rows={filteredPlan}
                  columns={planColumns}
                  rowKey={(r) => r.id}
                  defaultSortKey="production_date"
                  storageKey={`columnWidths:rawdata-${productLine}-plan`}
                  columnVisibilityKey={`columnVisibility:rawdata-${productLine}-plan`}
                />
              </>
            ))}
        </>
      )}
    </div>
  );
}
