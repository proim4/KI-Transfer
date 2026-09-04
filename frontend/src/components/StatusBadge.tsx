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
  overage: number;
  thresholds: StatusThresholds;
}

export default function StatusBadge({ pct, overage, thresholds }: StatusBadgeProps) {
  const status = computeStatus(pct, overage, thresholds);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${TEXT_CLASS[status.color]}`}>
        <span className={`h-2 w-2 rounded-full ${DOT_CLASS[status.color]}`} />
        {status.label}
      </span>
      {status.isOverage && (
        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">เกินแผน</span>
      )}
    </span>
  );
}
