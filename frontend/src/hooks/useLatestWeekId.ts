import { useQuery } from '@tanstack/react-query';
import { pickLatestWeekId, type ActivityStamp } from '../lib/latestWeek';
import { supabase } from '../lib/supabase';
import { useWeeks } from './useWeeks';

export const LATEST_UPLOAD_STAMPS_QUERY_KEY = ['upload-activity-latest-stamps'];

/**
 * Two sources feed "latest activity," combined: upload_history.created_at
 * (every upload going forward) and uploads.updated_at (uploads made before
 * upload_history existed — see lib/latestWeek.ts for why both are needed).
 */
function useLatestActivityStamps() {
  return useQuery({
    queryKey: LATEST_UPLOAD_STAMPS_QUERY_KEY,
    queryFn: async (): Promise<ActivityStamp[]> => {
      const [history, uploads] = await Promise.all([
        supabase.from('upload_history').select('week_id, created_at'),
        supabase.from('uploads').select('week_id, updated_at'),
      ]);
      if (history.error) throw history.error;
      if (uploads.error) throw uploads.error;
      return [
        ...history.data.map((r) => ({ week_id: r.week_id, timestamp: r.created_at })),
        ...uploads.data.map((r) => ({ week_id: r.week_id, timestamp: r.updated_at })),
      ];
    },
  });
}

/** The week to default to when a page first loads — see lib/latestWeek.ts. */
export function useLatestWeekId(): string | null {
  const { data: weeks } = useWeeks();
  const { data: stamps } = useLatestActivityStamps();
  if (!weeks) return null;
  return pickLatestWeekId(weeks, stamps ?? []);
}
