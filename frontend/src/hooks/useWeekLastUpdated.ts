import { lastUpdatedAt } from '../lib/lastUpdated';
import { useAllUploadFiles } from './useUploadFiles';
import { useUploads } from './useUploads';

/** Latest upload time for a week across both upload models — ABS0000 and BDR130 now live in upload_files, BSR030 still in uploads. */
export function useWeekLastUpdated(weekId: string | null): string | undefined {
  const { data: uploads } = useUploads(weekId);
  const { data: files } = useAllUploadFiles(weekId);
  return lastUpdatedAt([...(uploads ?? []), ...(files ?? [])]);
}
