interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  size?: 'default' | 'hero';
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

export default function KpiCard({ label, value, sub, tone = 'default', size = 'default' }: KpiCardProps) {
  const isHero = size === 'hero';
  return (
    <div
      className={
        isHero
          ? 'rounded-lg border border-navy-100 bg-navy-50 p-5'
          : 'rounded-lg border border-gray-200 bg-white p-4'
      }
    >
      <p
        className={
          isHero
            ? 'text-xs font-semibold uppercase tracking-wide text-navy-500'
            : 'text-xs font-medium uppercase tracking-wide text-gray-500'
        }
      >
        {label}
      </p>
      <p className={`mt-1 font-semibold ${isHero ? `text-3xl ${heroToneClass[tone]}` : `text-2xl ${toneClass[tone]}`}`}>
        {value}
      </p>
      {sub && <p className={`mt-1 text-xs ${isHero ? 'text-navy-400' : 'text-gray-400'}`}>{sub}</p>}
    </div>
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
