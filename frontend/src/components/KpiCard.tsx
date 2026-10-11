interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  size?: 'default' | 'hero';
  /** Explanation shown as a tooltip on an ⓘ next to the label (e.g. how a % is calculated). */
  hint?: string;
  /** Makes the whole card a toggle button (e.g. filtering the table below by this KPI). */
  onClick?: () => void;
  active?: boolean;
  /** Tooltip for the clickable card. */
  title?: string;
}

const toneClass: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-gray-900',
  good: 'text-green-600',
  bad: 'text-red-600',
  warn: 'text-amber-600',
};

const heroToneClass: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-navy-900',
  good: 'text-green-700',
  bad: 'text-red-700',
  warn: 'text-amber-700',
};

export default function KpiCard({ label, value, sub, tone = 'default', size = 'default', hint, onClick, active = false, title }: KpiCardProps) {
  const isHero = size === 'hero';
  const Tag = onClick ? 'button' : 'div';
  const base = isHero
    ? 'h-full w-full rounded-xl border bg-navy-50 p-5 text-left shadow-sm transition-shadow hover:shadow-md'
    : 'h-full w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md';
  const border = active ? 'border-navy-500 ring-2 ring-navy-400' : isHero ? 'border-navy-100' : 'border-gray-200';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': active, title } : {})}
      className={`${base} ${border} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <p
        className={
          isHero
            ? 'text-xs font-semibold uppercase tracking-wide text-navy-500'
            : 'text-xs font-medium uppercase tracking-wide text-gray-500'
        }
      >
        {label}
        {hint && (
          <span title={hint} aria-label={hint} className="ml-1 cursor-help normal-case">
            ⓘ
          </span>
        )}
      </p>
      <p
        className={`mt-1 font-semibold tabular-nums ${isHero ? `text-3xl ${heroToneClass[tone]}` : `text-2xl ${toneClass[tone]}`}`}
      >
        {value}
      </p>
      {sub && <p className={`mt-1 text-xs ${isHero ? 'text-navy-400' : 'text-gray-400'}`}>{sub}</p>}
    </Tag>
  );
}

export function formatPct(pct: number | null): string {
  return pct === null ? '-' : `${(pct * 100).toFixed(2)}%`;
}

export function formatKg(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} kg`;
}

export function formatBaht(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} บาท`;
}
