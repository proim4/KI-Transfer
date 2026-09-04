import { computeStatus, type StatusThresholds } from '../lib/statusBadge';
import { formatPct } from './KpiCard';
import type { StatusColor } from '../types/db';

const TEXT_CLASS: Record<StatusColor, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  navy: 'text-navy-800',
  blue: 'text-blue-700',
  gray: 'text-gray-500',
};

const BAR_CLASS: Record<StatusColor, string> = {
  green: 'bg-green-200',
  amber: 'bg-amber-200',
  red: 'bg-red-200',
  navy: 'bg-navy-200',
  blue: 'bg-blue-200',
  gray: 'bg-gray-200',
};

interface PctBarProps {
  pct: number | null;
  thresholds: StatusThresholds;
}

/** The "% โอนเทียบแผน" cell: text tinted by status zone, with a thin Excel-style data bar behind it showing performance at a glance. */
export default function PctBar({ pct, thresholds }: PctBarProps) {
  const status = computeStatus(pct, thresholds);
  const barWidth = pct === null ? 0 : Math.min(100, Math.max(0, pct * 100));

  return (
    <div className="relative overflow-hidden rounded">
      <div className={`absolute inset-y-0 left-0 ${BAR_CLASS[status.color]}`} style={{ width: `${barWidth}%` }} />
      <span className={`relative z-10 block px-1.5 py-0.5 text-right font-medium ${TEXT_CLASS[status.color]}`}>
        {formatPct(pct)}
      </span>
    </div>
  );
}
