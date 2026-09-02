import { useQuery } from '@tanstack/react-query';
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

export function useUnmatchedActual(weekId: string | null) {
  return useQuery({
    queryKey: ['unmatched-actual', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<UnmatchedActualRow[]> =>
      fetchAllRows((from, to) => supabase.from('unmatched_actual').select('*').eq('week_id', weekId!).range(from, to)),
  });
}
