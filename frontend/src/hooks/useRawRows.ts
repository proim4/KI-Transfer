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
  /** The full original Excel row for this record, keyed by its source header — null for rows uploaded before this was captured. */
  raw: Record<string, unknown> | null;
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
  /** The full original Excel row for this record, keyed by its source header — null for rows uploaded before this was captured. */
  raw: Record<string, unknown> | null;
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

export interface RawSupplyDailyRow {
  id: number;
  production_date: string;
  origin_code: string;
  origin_name: string;
  product_group: string;
  product_group_custom: string;
  remaining_qty: number;
  raw: Record<string, unknown> | null;
}

export interface RawPricingRow {
  id: number;
  price_date: string;
  vendor_group: string;
  product_group: string;
  cost_z: number;
  margin: number;
  net_price: number;
  raw: Record<string, unknown> | null;
}

export interface RawBiddingRow {
  id: number;
  sales_date: string;
  plant_code: string;
  product_group: string;
  allocate_sp_type: string;
  is_low_bid: boolean;
  raw: Record<string, unknown> | null;
}

export function useRawSupplyDailyRows(weekId: string | null) {
  return useQuery({
    queryKey: ['raw-supply-daily-rows', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<RawSupplyDailyRow[]> =>
      fetchAllRows((from, to) => supabase.from('supply_daily_rows').select('*').eq('week_id', weekId!).range(from, to)),
  });
}

export function useRawPricingRows(weekId: string | null) {
  return useQuery({
    queryKey: ['raw-pricing-rows', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<RawPricingRow[]> =>
      fetchAllRows((from, to) => supabase.from('pricing_rows').select('*').eq('week_id', weekId!).range(from, to)),
  });
}

export function useRawBiddingRows(weekId: string | null) {
  return useQuery({
    queryKey: ['raw-bidding-rows', weekId],
    enabled: !!weekId,
    queryFn: (): Promise<RawBiddingRow[]> =>
      fetchAllRows((from, to) => supabase.from('bidding_rows').select('*').eq('week_id', weekId!).range(from, to)),
  });
}
