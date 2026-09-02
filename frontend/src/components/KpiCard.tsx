interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad';
}

const toneClass: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-gray-900',
  good: 'text-green-600',
  bad: 'text-red-600',
};

export default function KpiCard({ label, value, sub, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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
