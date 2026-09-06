export interface RouteFilterValue {
  search: string;
}

export const EMPTY_ROUTE_FILTER: RouteFilterValue = { search: '' };

export function matchesRouteFilter(filter: RouteFilterValue, row: { searchText: string }): boolean {
  return !filter.search || row.searchText.toLowerCase().includes(filter.search.toLowerCase());
}

interface RouteFilterBarProps {
  value: RouteFilterValue;
  onChange: (value: RouteFilterValue) => void;
  resultCount: number;
}

const inputClass = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900';

/**
 * Free-text search box + result count for a route-level table. Used to also
 * carry date/origin/dest/product-group dropdown filters, but those became
 * redundant once every column got its own Excel-style header filter dropdown
 * (see SortableTable's headerFilter) — removed rather than kept as dead
 * duplicate UI.
 */
export default function RouteFilterBar({ value, onChange, resultCount }: RouteFilterBarProps) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <input
        type="text"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="ค้นหา..."
        className={`${inputClass} w-40`}
      />
      <span className="text-xs text-gray-400">{resultCount} รายการ</span>
    </div>
  );
}
