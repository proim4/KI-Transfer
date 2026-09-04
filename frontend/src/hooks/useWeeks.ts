import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ProductLine, WeekRow } from '../types/db';

function queryKey(productLine: ProductLine) {
  return ['weeks', productLine];
}

export function useWeeks(productLine: ProductLine) {
  return useQuery({
    queryKey: queryKey(productLine),
    queryFn: async (): Promise<WeekRow[]> => {
      const { data, error } = await supabase
        .from('weeks')
        .select('*')
        .eq('product_line', productLine)
        .order('year_no', { ascending: false })
        .order('week_no', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWeek(productLine: ProductLine) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ yearNo, weekNo }: { yearNo: number; weekNo: number }) => {
      const label = `WK${weekNo}`;
      const { data, error } = await supabase
        .from('weeks')
        .insert({ year_no: yearNo, week_no: weekNo, label, product_line: productLine })
        .select('*')
        .single();
      if (error) throw error;
      return data as WeekRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(productLine) }),
  });
}
