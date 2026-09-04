import { computeStatus, type StatusThresholds } from '../lib/statusBadge';
import type { StatusColor } from '../types/db';

const DOT_CLASS: Record<StatusColor, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  navy: 'bg-navy-700',
  blue: 'bg-blue-500',
  gray: 'bg-gray-400',
};

const TEXT_CLASS: Record<StatusColor, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  navy: 'text-navy-800',
  blue: 'text-blue-700',
  gray: 'text-gray-500',
};

interface StatusBadgeProps {
  pct: number | null;
  thresholds: StatusThresholds;
}

export default function StatusBadge({ pct, thresholds }: StatusBadgeProps) {
  const status = computeStatus(pct, thresholds);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${TEXT_CLASS[status.color]}`}>
      <span className={`h-2 w-2 rounded-full ${DOT_CLASS[status.color]}`} />
      {status.label}
    </span>
  );
}
