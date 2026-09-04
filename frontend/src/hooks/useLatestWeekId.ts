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

/**
 * The week to default to when a page first loads — see lib/latestWeek.ts.
 * Returns null until *both* underlying queries have actually settled — an
 * empty `stamps` array only means "no activity yet" when the query truly
 * succeeded with zero rows, never "hasn't loaded yet". Treating the two the
 * same (e.g. via `stamps ?? []`) races: if `weeks` resolves before `stamps`,
 * it looks like there's no activity at all and falls back to weeks[0] (the
 * newest by year/week number) — permanently, since useDefaultedWeekId locks
 * in the first non-null value it sees and never reconsiders.
 */
export function useLatestWeekId(): string | null {
  const weeksQuery = useWeeks();
  const stampsQuery = useLatestActivityStamps();
  if (!weeksQuery.isSuccess || !stampsQuery.isSuccess) return null;
  return pickLatestWeekId(weeksQuery.data, stampsQuery.data);
}
