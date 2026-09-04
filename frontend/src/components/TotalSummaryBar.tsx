interface SummaryItem {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'default';
}

const TONE_CLASS: Record<NonNullable<SummaryItem['tone']>, string> = {
  good: 'text-green-700',
  bad: 'text-red-700',
  default: 'text-gray-900',
};

interface TotalSummaryBarProps {
  items: SummaryItem[];
}

/**
 * A "Grand Total" strip above the table header — like a PivotTable's grand
 * total row, but pinned to the top. Purely presentational: every page
 * computes its own totals from whatever rows are currently filtered/visible
 * and passes them in here, so this component never risks summing hidden data.
 */
export default function TotalSummaryBar({ items }: TotalSummaryBarProps) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
          <p className={`text-base font-bold ${TONE_CLASS[item.tone ?? 'default']}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
