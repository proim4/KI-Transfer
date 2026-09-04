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
}

/**
 * Pure presentation logic: buckets the already-computed total_pct (0–1,
 * capped at 1 by calcEngine's tolerance rule — see calcEngine.ts) into 3
 * admin-configurable zones.
 */
export function computeStatus(pct: number | null, thresholds: StatusThresholds): StatusInfo {
  if (pct === null) {
    return { zone: 'none', color: 'gray', label: 'ไม่มีแผน' };
  }
  if (pct >= thresholds.highPct) {
    return { zone: 'high', color: thresholds.highColor, label: 'ตามแผน' };
  }
  if (pct >= thresholds.lowPct) {
    return { zone: 'mid', color: thresholds.midColor, label: 'ต่ำกว่าแผน' };
  }
  return { zone: 'low', color: thresholds.lowColor, label: 'ต่ำกว่าแผนมาก' };
}
