import { supabase } from './supabase';
import { isoWeekRange } from './uploadChecks';

/** The selected Week's label and Monday..Sunday date range (ISO week), for upload-time date checks. */
export async function fetchWeekRange(weekId: string): Promise<{ label: string; range: { start: string; end: string } }> {
  const { data, error } = await supabase.from('weeks').select('label, year_no, week_no').eq('id', weekId).single();
  if (error) throw error;
  return { label: data.label, range: isoWeekRange(data.year_no, data.week_no) };
}
