import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { recomputeTrackingRow, routeKeyOf, routePlanWeeklyOf } from '../lib/rowCalc';
import { supabase } from '../lib/supabase';
import type { TrackingActualAdjustmentRow, TrackingResultRow, UnmatchedActualRow } from '../types/db';

export function useTrackingResults(weekId: string | null) {
  return useQuery({
    queryKey: ['tracking-results', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<TrackingResultRow[]> =>
      fetchAllRows((from, to) => supabase.from('tracking_results').select('*').eq('week_id', weekId!).range(from, to)),
  });
}

/** Saves one row's remark. Patches the cached list in place instead of
 * invalidating/refetching, so other cells mid-edit elsewhere in the table
 * aren't disrupted. */
export function useUpdateRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, remark }: { id: number; remark: string | null }) => {
      const { error } = await supabase.from('tracking_results').update({ remark }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, remark }) => {
      queryClient.setQueriesData<TrackingResultRow[]>({ queryKey: ['tracking-results'] }, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, remark } : r)),
      );
    },
  });
}

interface AdjustActualInput {
  row: TrackingResultRow;
  /** Every tracking_results row sharing this route (same production_date/origin/dest/product_group) — actual_total is one shared figure across all of them, so all must be updated together. Must include `row` itself. */
  siblings: TrackingResultRow[];
  newActual: number;
  reason: string;
  userId: string | null;
  userName: string;
}

/**
 * Adjusts "โอนจริง" (ABS0000 actual_total) for a whole route: writes the new
 * value plus every derived column (DIFF/%/overage/profit for all three
 * channels) to each sibling row sharing that route, records one audit-log
 * entry, then patches the cache in place (same pattern as useUpdateRemark)
 * so Summary and every open Tracking tab reflect it immediately without a
 * refetch.
 *
 * Persisted via the apply_actual_adjustment Postgres function (see migration
 * 0017) so every sibling UPDATE plus the audit-log INSERT commit as one
 * transaction — a partial failure can no longer leave sibling rows
 * disagreeing on actual_total — and so a stale `row.actual_total` (someone
 * else adjusted this route after it was loaded here) is rejected instead of
 * silently overwritten.
 */
export function useAdjustActual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, siblings, newActual, reason, userId, userName }: AdjustActualInput) => {
      const now = new Date().toISOString();
      const routePlanWeekly = routePlanWeeklyOf(siblings);
      const updates = siblings.map((s) => ({
        id: s.id,
        ...recomputeTrackingRow(s, newActual, routePlanWeekly),
        actual_original: s.actual_original ?? s.actual_total,
        adjusted_by: userId,
        adjusted_by_name: userName,
        adjusted_at: now,
        adjustment_reason: reason,
      }));

      const { error } = await supabase.rpc('apply_actual_adjustment', {
        p_ids: siblings.map((s) => s.id),
        p_expected_actual: row.actual_total,
        p_updates: updates,
        p_log: {
          week_id: row.week_id,
          production_date: row.production_date,
          origin_code: row.origin_code,
          origin_name: row.origin_name,
          dest_code: row.dest_code,
          dest_name: row.dest_name,
          product_group: row.product_group,
          previous_actual: row.actual_total,
          new_actual: newActual,
          reason,
          adjusted_by: userId,
          adjusted_by_name: userName,
        },
      });
      if (error) {
        if (error.code === 'P0001') {
          throw new Error('ค่านี้เพิ่งถูกแก้ไขโดยผู้อื่น กรุณาปิดหน้าต่างนี้แล้วเปิดใหม่เพื่อดูค่าล่าสุดก่อนแก้ไขอีกครั้ง');
        }
        throw error;
      }

      return { siblingIds: new Set(siblings.map((s) => s.id)), routePlanWeekly, newActual, reason, userId, userName, now };
    },
    onSuccess: (result) => {
      queryClient.setQueriesData<TrackingResultRow[]>({ queryKey: ['tracking-results'] }, (rows) =>
        rows?.map((r) =>
          result.siblingIds.has(r.id)
            ? {
                ...r,
                ...recomputeTrackingRow(r, result.newActual, result.routePlanWeekly),
                actual_original: r.actual_original ?? r.actual_total,
                is_adjusted: true,
                adjusted_by: result.userId,
                adjusted_by_name: result.userName,
                adjusted_at: result.now,
                adjustment_reason: result.reason,
              }
            : r,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['tracking-actual-adjustments'] });
    },
    onError: () => {
      // The cached row(s) may be stale (this is exactly how a conflict is
      // detected) — refetch so the still-open modal shows the real current
      // value instead of the one that was just rejected.
      queryClient.invalidateQueries({ queryKey: ['tracking-results'] });
    },
  });
}

/** Every sibling row (same week + route) an actual-value edit on `row` must also update — actual_total is shared across price-variant rows of one route. */
export function siblingsOfRoute(rows: TrackingResultRow[], row: TrackingResultRow): TrackingResultRow[] {
  const key = routeKeyOf(row);
  return rows.filter((r) => routeKeyOf(r) === key);
}

/** Full adjustment history for one route, newest first — powers the "History" view next to an adjusted actual value. */
export function useActualAdjustmentHistory(weekId: string | null, row: TrackingResultRow | null) {
  return useQuery({
    queryKey: ['tracking-actual-adjustments', weekId, row ? routeKeyOf(row) : null],
    enabled: !!weekId && !!row,
    queryFn: (): Promise<TrackingActualAdjustmentRow[]> =>
      fetchAllRows((from, to) =>
        supabase
          .from('tracking_actual_adjustments')
          .select('*')
          .eq('week_id', weekId!)
          .eq('production_date', row!.production_date)
          .eq('origin_code', row!.origin_code)
          .eq('dest_code', row!.dest_code)
          .eq('product_group', row!.product_group)
          .order('created_at', { ascending: false })
          .range(from, to),
      ),
  });
}

export function useUnmatchedActual(weekId: string | null) {
  return useQuery({
    queryKey: ['unmatched-actual', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<UnmatchedActualRow[]> =>
      fetchAllRows((from, to) => supabase.from('unmatched_actual').select('*').eq('week_id', weekId!).range(from, to)),
  });
}
