import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UploadHistoryRow } from '../types/db';
import { LATEST_UPLOAD_STAMPS_QUERY_KEY } from './useLatestWeekId';
import { useProcessWeek } from './useProcessWeek';
import { uploadsQueryKey } from './useUploads';

export function uploadHistoryQueryKey(weekId: string | null) {
  return ['upload-history', weekId];
}

export function useUploadHistory(weekId: string | null) {
  return useQuery({
    queryKey: uploadHistoryQueryKey(weekId),
    enabled: !!weekId,
    queryFn: async (): Promise<UploadHistoryRow[]> => {
      const { data, error } = await supabase
        .from('upload_history')
        .select('*')
        .eq('week_id', weekId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** All upload_history rows across every week — feeds the collapsed by-week summary list on the Upload page. */
export function useAllUploadHistory() {
  return useQuery({
    queryKey: ['upload-history-all'],
    queryFn: async (): Promise<UploadHistoryRow[]> => {
      const { data, error } = await supabase.from('upload_history').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

const SOURCE_FILE_BY_TYPE: Record<string, 'weekly' | 'daily'> = {
  plan_weekly_bsr030: 'weekly',
  plan_daily_bdr130: 'daily',
};

/**
 * Deletes one upload_history row. If it's the current version for its slot,
 * this also clears that slot's live data (plan_rows/actual_rows), resets the
 * `uploads` row so the dropzone shows "ยังไม่อัพโหลด" again, and immediately
 * re-runs process-week so Dashboard/Tracking reflect the removal. Deleting a
 * superseded (already-replaced) version only removes the log entry — its data
 * was already purged when the newer version was uploaded.
 */
export function useDeleteUploadHistory(weekId: string) {
  const queryClient = useQueryClient();
  const processWeek = useProcessWeek();

  return useMutation({
    mutationFn: async ({ row, isCurrent }: { row: UploadHistoryRow; isCurrent: boolean }) => {
      if (isCurrent) {
        if (row.storage_path) {
          await supabase.storage.from('transfer-uploads').remove([row.storage_path]);
        }

        if (row.file_type === 'actual_abs0000') {
          await supabase.from('actual_rows').delete().eq('week_id', weekId);
        } else {
          await supabase
            .from('plan_rows')
            .delete()
            .eq('week_id', weekId)
            .eq('source_file', SOURCE_FILE_BY_TYPE[row.file_type]);
        }

        await supabase.from('uploads').delete().eq('week_id', weekId).eq('file_type', row.file_type);
      }

      const { error } = await supabase.from('upload_history').delete().eq('id', row.id);
      if (error) throw error;

      if (isCurrent) {
        await processWeek.mutateAsync(weekId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uploadHistoryQueryKey(weekId) });
      queryClient.invalidateQueries({ queryKey: ['upload-history-all'] });
      queryClient.invalidateQueries({ queryKey: LATEST_UPLOAD_STAMPS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: uploadsQueryKey(weekId) });
      queryClient.invalidateQueries({ queryKey: ['raw-plan-rows', weekId] });
      queryClient.invalidateQueries({ queryKey: ['raw-actual-rows', weekId] });
    },
  });
}
