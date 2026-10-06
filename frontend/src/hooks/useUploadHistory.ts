import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UploadFileType, UploadHistoryRow } from '../types/db';
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

const SOURCE_FILE_BY_TYPE: Record<string, 'weekly' | 'daily'> = {
  plan_weekly_bsr030: 'weekly',
};

const TABLE_BY_TYPE: Record<string, string> = {
  actual_abs0000: 'actual_rows',
  plan_weekly_bsr030: 'plan_rows',
};

/**
 * Deletes the current file of a single-file slot: clears that slot's live
 * data (plan_rows/actual_rows) and stored file, resets the `uploads` row so
 * the dropzone shows "ยังไม่อัปโหลด" again, removes its upload_history entry
 * when there is one (files uploaded before history logging have none), and
 * re-runs process-week so Dashboard/Tracking reflect the removal.
 */
interface DeleteSlotArgs {
  weekId: string;
  fileType: UploadFileType;
  storagePath: string | null;
  historyId: string | null;
}

export function useDeleteUploadHistory(weekId: string) {
  const queryClient = useQueryClient();
  const processWeek = useProcessWeek();

  return useMutation({
    mutationFn: async ({ fileType, storagePath, historyId }: DeleteSlotArgs) => {
      if (storagePath) {
        await supabase.storage.from('transfer-uploads').remove([storagePath]);
      }

      const table = TABLE_BY_TYPE[fileType];
      const sourceFile = SOURCE_FILE_BY_TYPE[fileType];
      const { error: dataError } = sourceFile
        ? await supabase.from(table).delete().eq('week_id', weekId).eq('source_file', sourceFile)
        : await supabase.from(table).delete().eq('week_id', weekId);
      if (dataError) throw dataError;

      const { error: uploadError } = await supabase.from('uploads').delete().eq('week_id', weekId).eq('file_type', fileType);
      if (uploadError) throw uploadError;

      if (historyId !== null) {
        const { error } = await supabase.from('upload_history').delete().eq('id', historyId);
        if (error) throw error;
      }

      await processWeek.mutateAsync(weekId);
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
