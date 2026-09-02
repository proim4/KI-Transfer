import { supabase } from './supabase';

export async function insertInBatches(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}
