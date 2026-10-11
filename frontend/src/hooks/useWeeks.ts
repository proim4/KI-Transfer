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

/** What deleting a week would take with it — shown in the confirm dialog before anything is removed. */
export function useWeekDataCounts(weekId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['weekDataCounts', weekId],
    enabled: !!weekId && enabled,
    queryFn: async () => {
      const count = async (table: string) => {
        const { count: n, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('week_id', weekId!);
        if (error) throw error;
        return n ?? 0;
      };
      const [uploadCount, uploadFileCount, trackingCount] = await Promise.all([
        count('uploads'),
        count('upload_files'),
        count('tracking_results'),
      ]);
      return { fileCount: uploadCount + uploadFileCount, trackingCount };
    },
  });
}

export function useDeleteWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (weekId: string) => {
      // Storage access is checked against the week row (can_access_storage_path),
      // so the uploaded files must go before the week does. Every stored file —
      // including ones later replaced — is recorded in upload_history.
      const paths = new Set<string>();
      for (const table of ['upload_history', 'uploads', 'upload_files']) {
        const { data, error } = await supabase.from(table).select('storage_path').eq('week_id', weekId);
        if (error) throw error;
        for (const r of (data ?? []) as { storage_path: string | null }[]) if (r.storage_path) paths.add(r.storage_path);
      }
      if (paths.size > 0) {
        const { error } = await supabase.storage.from('transfer-uploads').remove([...paths]);
        if (error) throw error;
      }
      // Every data table references weeks with on delete cascade.
      const { data, error } = await supabase.from('weeks').delete().eq('id', weekId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('ไม่มีสิทธิ์ลบ Week นี้ หรือ Week ถูกลบไปแล้ว');
    },
    // A deleted week touches nearly every cached query (weeks, latest week, uploads, results).
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
