import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UploadFileType, UploadRow } from '../types/db';

export function uploadsQueryKey(weekId: string | null) {
  return ['uploads', weekId];
}

export function useUploads(weekId: string | null) {
  return useQuery({
    queryKey: uploadsQueryKey(weekId),
    enabled: !!weekId,
    queryFn: async (): Promise<UploadRow[]> => {
      const { data, error } = await supabase.from('uploads').select('*').eq('week_id', weekId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUploadFor(weekId: string | null, fileType: UploadFileType): UploadRow | undefined {
  const { data } = useUploads(weekId);
  return data?.find((u) => u.file_type === fileType);
}

export function useInvalidateUploads() {
  const queryClient = useQueryClient();
  return (weekId: string) => queryClient.invalidateQueries({ queryKey: uploadsQueryKey(weekId) });
}
