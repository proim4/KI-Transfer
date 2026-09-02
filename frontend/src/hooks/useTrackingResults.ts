import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { TrackingResultRow, UnmatchedActualRow } from '../types/db';

export function useTrackingResults(weekId: string | null) {
  return useQuery({
    queryKey: ['tracking-results', weekId],
    enabled: !!weekId,
    queryFn: async (): Promise<TrackingResultRow[]> => {
      const { data, error } = await supabase.from('tracking_results').select('*').eq('week_id', weekId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUnmatchedActual(weekId: string | null) {
  return useQuery({
    queryKey: ['unmatched-actual', weekId],
    enabled: !!weekId,
    queryFn: async (): Promise<UnmatchedActualRow[]> => {
      const { data, error } = await supabase.from('unmatched_actual').select('*').eq('week_id', weekId!);
      if (error) throw error;
      return data;
    },
  });
}
