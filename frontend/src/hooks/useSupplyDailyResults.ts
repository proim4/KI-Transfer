import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { supabase } from '../lib/supabase';
import type { MasFactoryZoneRow, SupplyDailyResultRow } from '../types/db';

export function useSupplyDailyResults(weekId: string | null) {
  return useQuery({
    queryKey: ['supply-daily-results', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<SupplyDailyResultRow[]> =>
      fetchAllRows((from, to) =>
        supabase.from('supply_daily_results').select('*').eq('week_id', weekId!).range(from, to),
      ),
  });
}

/** Global factory roster (not week-scoped) — used only for the "จำนวนโรงงานทั้งหมด" KPI denominator. */
export function useMasFactoryZones() {
  return useQuery({
    queryKey: ['mas-factory-zones'],
    queryFn: (): Promise<MasFactoryZoneRow[]> =>
      fetchAllRows((from, to) => supabase.from('mas_factory_zones').select('*').range(from, to)),
  });
}
