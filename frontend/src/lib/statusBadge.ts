import type { StatusColor } from '../types/db';

export interface StatusThresholds {
  highPct: number;
  lowPct: number;
  highColor: StatusColor;
  midColor: StatusColor;
  lowColor: StatusColor;
  zeroColor: StatusColor;
}

export interface StatusInfo {
  zone: 'high' | 'mid' | 'low' | 'zero' | 'none';
  color: StatusColor | 'gray';
  label: string;
}

/**
 * Pure presentation logic: buckets the already-computed total_pct (0–1,
 * capped at 1 by calcEngine's tolerance rule — see calcEngine.ts) into
 * admin-configurable zones. Exactly 0% against an existing plan ("ไม่โอนตามแผน")
 * is treated as its own zone, more severe than merely below the low
 * threshold — checked before the low-zone fallback.
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
  if (pct === 0) {
    return { zone: 'zero', color: thresholds.zeroColor, label: 'ไม่โอนตามแผน' };
  }
  return { zone: 'low', color: thresholds.lowColor, label: 'ต่ำกว่าแผนมาก' };
}
