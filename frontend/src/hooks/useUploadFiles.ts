import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { MultiFileUploadType, UploadFileRow } from '../types/db';
import { useProcessWeek } from './useProcessWeek';

export function uploadFilesQueryKey(weekId: string | null, fileType: MultiFileUploadType) {
  return ['upload-files', weekId, fileType];
}

/** Prefix of every upload-files query for a week (per-type lists and the all-types list) — invalidate this after any change. */
export function weekUploadFilesQueryKey(weekId: string | null) {
  return ['upload-files', weekId];
}

/** Every currently-active multi-file upload for one week, across all file types. */
export function useAllUploadFiles(weekId: string | null) {
  return useQuery({
    queryKey: [...weekUploadFilesQueryKey(weekId), 'all'],
    enabled: !!weekId,
    queryFn: async (): Promise<UploadFileRow[]> => {
      const { data, error } = await supabase.from('upload_files').select('*').eq('week_id', weekId!);
      if (error) throw error;
      return data;
    },
  });
}

/** All currently-active files for one (week, file_type) — the 3 Supply Daily sources that support several files per week (see migration 0012). */
export function useUploadFiles(weekId: string | null, fileType: MultiFileUploadType) {
  return useQuery({
    queryKey: uploadFilesQueryKey(weekId, fileType),
    enabled: !!weekId,
    queryFn: async (): Promise<UploadFileRow[]> => {
      const { data, error } = await supabase
        .from('upload_files')
        .select('*')
        .eq('week_id', weekId!)
        .eq('file_type', fileType)
        .order('original_filename', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Deletes one file and (via FK cascade — see migration 0012) every row it contributed, then re-runs process-week so supply_daily_results reflects the removal. */
export function useDeleteUploadFile(weekId: string) {
  const queryClient = useQueryClient();
  const processWeek = useProcessWeek();

  return useMutation({
    mutationFn: async (row: UploadFileRow) => {
      if (row.storage_path) {
        await supabase.storage.from('transfer-uploads').remove([row.storage_path]);
      }
      const { error } = await supabase.from('upload_files').delete().eq('id', row.id);
      if (error) throw error;

      await processWeek.mutateAsync(weekId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: weekUploadFilesQueryKey(weekId) });
      queryClient.invalidateQueries({ queryKey: ['supply-daily-results', weekId] });
    },
  });
}
