import type { StatusColor } from '../types/db';

export interface StatusThresholds {
  highPct: number;
  lowPct: number;
  highColor: StatusColor;
  midColor: StatusColor;
  lowColor: StatusColor;
}

export interface StatusInfo {
  zone: 'high' | 'mid' | 'low' | 'none';
  color: StatusColor | 'gray';
  label: string;
  isOverage: boolean;
}

/**
 * Pure presentation logic: buckets the already-computed total_pct (0–1,
 * capped at 1 by calcEngine's tolerance rule — see calcEngine.ts) into 3
 * admin-configurable zones. `overage` (also already computed) is reported
 * separately (isOverage) rather than as a 4th zone, since actual exceeding
 * plan is a distinct condition from "% vs plan" and total_pct can't exceed 1
 * to represent it.
 */
export function computeStatus(
  pct: number | null,
  overage: number,
  thresholds: StatusThresholds,
): StatusInfo {
  const isOverage = overage > 0;

  if (pct === null) {
    return { zone: 'none', color: 'gray', label: 'ไม่มีแผน', isOverage };
  }
  if (pct >= thresholds.highPct) {
    return { zone: 'high', color: thresholds.highColor, label: 'ตามแผน', isOverage };
  }
  if (pct >= thresholds.lowPct) {
    return { zone: 'mid', color: thresholds.midColor, label: 'ต่ำกว่าแผน', isOverage };
  }
  return { zone: 'low', color: thresholds.lowColor, label: 'ต่ำกว่าแผนมาก', isOverage };
}
