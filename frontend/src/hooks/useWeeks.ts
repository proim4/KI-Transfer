import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { WeekRow } from '../types/db';

const QUERY_KEY = ['weeks'];

export function useWeeks() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<WeekRow[]> => {
      const { data, error } = await supabase
        .from('weeks')
        .select('*')
        .order('year_no', { ascending: false })
        .order('week_no', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ yearNo, weekNo }: { yearNo: number; weekNo: number }) => {
      const label = `WK${weekNo}`;
      const { data, error } = await supabase
        .from('weeks')
        .insert({ year_no: yearNo, week_no: weekNo, label })
        .select('*')
        .single();
      if (error) throw error;
      return data as WeekRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
