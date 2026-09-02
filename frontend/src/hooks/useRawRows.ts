import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { supabase } from '../lib/supabase';
import type { SourceFile } from '../types/tracking';

export interface RawPlanRow {
  id: number;
  source_file: SourceFile;
  production_date: string;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
  product_group: string;
  origin_price: number;
  dest_price: number;
  suggest: number;
  supply_after: number;
}

export interface RawActualRow {
  id: number;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
  transfer_date: string;
  sku_code: string;
  sku_name: string;
  weight_kg: number;
  product_group: string;
}

export function useRawPlanRows(weekId: string | null) {
  return useQuery({
    queryKey: ['raw-plan-rows', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<RawPlanRow[]> =>
      fetchAllRows((from, to) => supabase.from('plan_rows').select('*').eq('week_id', weekId!).range(from, to)),
  });
}

export function useRawActualRows(weekId: string | null) {
  return useQuery({
    queryKey: ['raw-actual-rows', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<RawActualRow[]> =>
      fetchAllRows((from, to) => supabase.from('actual_rows').select('*').eq('week_id', weekId!).range(from, to)),
  });
}
