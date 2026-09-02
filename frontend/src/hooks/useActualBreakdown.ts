import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { TrackingResultRow } from '../types/db';

interface ActualRowDb {
  id: number;
  sku_code: string;
  sku_name: string;
  weight_kg: number;
}

/** Exact-SKU breakdown behind one tracking-result group, fetched on demand when a row is expanded. */
export function useActualBreakdown(weekId: string, row: TrackingResultRow | null) {
  return useQuery({
    queryKey: ['actual-breakdown', weekId, row?.id],
    enabled: !!row,
    queryFn: async (): Promise<ActualRowDb[]> => {
      const { data, error } = await supabase
        .from('actual_rows')
        .select('id, sku_code, sku_name, weight_kg')
        .eq('week_id', weekId)
        .eq('transfer_date', row!.production_date)
        .eq('origin_code', row!.origin_code)
        .eq('dest_code', row!.dest_code)
        .eq('product_group', row!.product_group);
      if (error) throw error;
      return data;
    },
  });
}
