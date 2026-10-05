import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { supabase } from '../lib/supabase';
import type { DateShiftDecisionRow, UnmatchedActualRow } from '../types/db';
import { useProcessWeek } from './useProcessWeek';

function decisionsQueryKey(weekId: string | null) {
  return ['date-shift-decisions', weekId];
}

/** Current confirm/reject decisions on ±1-day match suggestions for one week (see migration 0018). */
export function useDateShiftDecisions(weekId: string | null) {
  return useQuery({
    queryKey: decisionsQueryKey(weekId),
    enabled: !!weekId,
    queryFn: (): Promise<DateShiftDecisionRow[]> =>
      fetchAllRows((from, to) =>
        supabase.from('tracking_date_shift_decisions').select('*').eq('week_id', weekId!).order('transfer_date').range(from, to),
      ),
  });
}

interface DecideInput {
  weekId: string;
  items: UnmatchedActualRow[];
  decision: 'confirmed' | 'rejected';
  userId: string | null;
  userName: string;
}

/**
 * Records a decision on one or more ±1-day suggestions, then reprocesses the
 * week so a confirmation is credited to its plan date (and noted there) — the
 * engine only ever applies a suggestion that has a stored 'confirmed' row.
 */
export function useDecideDateShift() {
  const queryClient = useQueryClient();
  const processWeek = useProcessWeek();

  return useMutation({
    mutationFn: async ({ weekId, items, decision, userId, userName }: DecideInput) => {
      const rows = items
        .filter((u) => u.suggested_plan_date)
        .map((u) => ({
          week_id: weekId,
          transfer_date: u.transfer_date,
          origin_code: u.origin_code,
          origin_name: u.origin_name,
          dest_code: u.dest_code,
          dest_name: u.dest_name,
          product_group: u.product_group,
          target_plan_date: u.suggested_plan_date!,
          weight_kg: u.total_weight_kg,
          decision,
          decided_by: userId,
          decided_by_name: userName,
          created_at: new Date().toISOString(),
        }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('tracking_date_shift_decisions')
        .upsert(rows, { onConflict: 'week_id,transfer_date,origin_code,dest_code,product_group' });
      if (error) throw error;
      await processWeek.mutateAsync(weekId);
    },
    onSettled: (_data, _error, { weekId }) => {
      queryClient.invalidateQueries({ queryKey: decisionsQueryKey(weekId) });
    },
  });
}

/** Withdraws a decision (back to "รอยืนยัน") and reprocesses the week. */
export function useUndoDateShift() {
  const queryClient = useQueryClient();
  const processWeek = useProcessWeek();

  return useMutation({
    mutationFn: async ({ weekId, id }: { weekId: string; id: string }) => {
      const { error } = await supabase.from('tracking_date_shift_decisions').delete().eq('id', id);
      if (error) throw error;
      await processWeek.mutateAsync(weekId);
    },
    onSettled: (_data, _error, { weekId }) => {
      queryClient.invalidateQueries({ queryKey: decisionsQueryKey(weekId) });
    },
  });
}
