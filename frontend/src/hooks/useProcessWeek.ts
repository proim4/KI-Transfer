import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface ProcessWeekResult {
  trackingRowCount: number;
  unmatchedRowCount: number;
}

/** Invokes the `process-week` Edge Function, which idempotently recomputes tracking_results/unmatched_actual from whatever plan_rows/actual_rows currently exist for the week. Shared by the manual "ประมวลผล" button and the auto-recalculate-after-delete flow. */
export function useProcessWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (weekId: string): Promise<ProcessWeekResult> => {
      const { data, error } = await supabase.functions.invoke('process-week', { body: { weekId } });
      if (error) throw error;
      return data as ProcessWeekResult;
    },
    onSuccess: (_data, weekId) => {
      queryClient.invalidateQueries({ queryKey: ['tracking-results', weekId] });
      queryClient.invalidateQueries({ queryKey: ['unmatched-actual', weekId] });
    },
  });
}
