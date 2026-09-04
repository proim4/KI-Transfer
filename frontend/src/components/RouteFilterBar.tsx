import { uniqueSorted } from '../lib/uniqueSorted';

export interface RouteFilterValue {
  date: string;
  origin: string;
  dest: string;
  productGroup: string;
  search: string;
}

export const EMPTY_ROUTE_FILTER: RouteFilterValue = { date: '', origin: '', dest: '', productGroup: '', search: '' };

interface RouteFilterOptions {
  dates: string[];
  origins: string[];
  dests: string[];
  productGroups: string[];
}

/** Derives the 4 dropdown option lists from a row set — one shared shape for any row with these 4 fields. */
export function routeFilterOptions<T>(
  rows: T[],
  pick: (row: T) => { date: string; origin: string; dest: string; productGroup: string },
): RouteFilterOptions {
  const picked = rows.map(pick);
  return {
    dates: uniqueSorted(picked.map((p) => p.date)),
    origins: uniqueSorted(picked.map((p) => p.origin)),
    dests: uniqueSorted(picked.map((p) => p.dest)),
    productGroups: uniqueSorted(picked.map((p) => p.productGroup)),
  };
}

export function matchesRouteFilter(
  filter: RouteFilterValue,
  row: { date: string; origin: string; dest: string; productGroup: string; searchText: string },
): boolean {
  return (
    (!filter.date || row.date === filter.date) &&
    (!filter.origin || row.origin === filter.origin) &&
    (!filter.dest || row.dest === filter.dest) &&
    (!filter.productGroup || row.productGroup === filter.productGroup) &&
    (!filter.search || row.searchText.toLowerCase().includes(filter.search.toLowerCase()))
  );
}

interface RouteFilterBarProps {
  value: RouteFilterValue;
  onChange: (value: RouteFilterValue) => void;
  options: RouteFilterOptions;
  resultCount: number;
}

const selectClass = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900';

/** The 4-dropdown (date/origin/dest/product group) filter bar shared by every route-level table in the app. */
export default function RouteFilterBar({ value, onChange, options, resultCount }: RouteFilterBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="ค้นหา..."
        className={`${selectClass} w-40`}
      />
      <select
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
        className={selectClass}
      >
        <option value="">ทุกวันที่</option>
        {options.dates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={value.origin}
        onChange={(e) => onChange({ ...value, origin: e.target.value })}
        className={selectClass}
      >
        <option value="">ทุกโรงงานต้นทาง</option>
        {options.origins.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select value={value.dest} onChange={(e) => onChange({ ...value, dest: e.target.value })} className={selectClass}>
        <option value="">ทุกโรงงานปลายทาง</option>
        {options.dests.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={value.productGroup}
        onChange={(e) => onChange({ ...value, productGroup: e.target.value })}
        className={selectClass}
      >
        <option value="">ทุกกลุ่มสินค้า</option>
        {options.productGroups.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-400">{resultCount} รายการ</span>
    </div>
  );
}
