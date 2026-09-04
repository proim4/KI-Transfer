import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { supabase } from '../lib/supabase';
import type { TrackingResultRow, UnmatchedActualRow } from '../types/db';

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

export function useUnmatchedActual(weekId: string | null) {
  return useQuery({
    queryKey: ['unmatched-actual', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<UnmatchedActualRow[]> =>
      fetchAllRows((from, to) => supabase.from('unmatched_actual').select('*').eq('week_id', weekId!).range(from, to)),
  });
}
