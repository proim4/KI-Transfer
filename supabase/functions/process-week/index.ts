// Supabase Edge Function: recomputes tracking_results (and unmatched_actual)
// for one week from its current plan_rows / actual_rows. This is the single
// place canonical numbers are produced — the frontend never computes and
// stores tracking numbers itself, it only triggers this function and reads
// the result back.
//
// Deploy: supabase functions deploy process-week
// Invoke:  supabase.functions.invoke('process-week', { body: { weekId } })

import { createClient } from 'npm:@supabase/supabase-js@2';
import { computeTracking, matchKey } from '../_shared/calcEngine.ts';
import { computeSupplyDailyResults } from '../_shared/supplyDailyCalcEngine.ts';
import { fetchAllRows } from '../_shared/fetchAllRows.ts';
import type {
  ActualAdjustment,
  ActualRow,
  BiddingRow,
  PlanRow,
  PricingRow,
  SupplyDailyMasterData,
  SupplyDailyRow,
} from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Called cross-origin from the frontend's own domain (Vercel), not from
// Supabase's own origin — without these headers the browser's CORS
// preflight (OPTIONS) is rejected and supabase-js reports it simply as
// "Failed to send a request to the Edge Function", with no server-side
// error to show for it.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toIsoDate(value: string): string {
  // Postgres `date` columns already round-trip through supabase-js as
  // 'YYYY-MM-DD' strings, so no reparsing is needed here.
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  let weekId: string | undefined;
  try {
    ({ weekId } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body, expected { weekId }' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  if (!weekId) {
    return new Response(JSON.stringify({ error: 'weekId is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let planRowsRaw: Record<string, unknown>[];
  let actualRowsRaw: Record<string, unknown>[];
  let adjustmentRowsRaw: Record<string, unknown>[];
  try {
    [planRowsRaw, actualRowsRaw, adjustmentRowsRaw] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('plan_rows').select('*').eq('week_id', weekId).range(from, to)),
      fetchAllRows((from, to) => supabase.from('actual_rows').select('*').eq('week_id', weekId).range(from, to)),
      fetchAllRows((from, to) =>
        supabase
          .from('tracking_actual_adjustments')
          .select('*')
          .eq('week_id', weekId)
          .order('created_at', { ascending: true })
          .range(from, to),
      ),
    ]);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err));
  }

  const planRows: PlanRow[] = planRowsRaw.map((r: any) => ({
    sourceFile: r.source_file,
    productionDate: toIsoDate(r.production_date),
    originCode: r.origin_code,
    originName: r.origin_name,
    destCode: r.dest_code,
    destName: r.dest_name,
    productGroup: r.product_group,
    originPrice: Number(r.origin_price),
    destPrice: Number(r.dest_price),
    suggest: Number(r.suggest),
    supplyAfter: Number(r.supply_after),
  }));

  const actualRows: ActualRow[] = actualRowsRaw.map((r: any) => ({
    originCode: r.origin_code,
    originName: r.origin_name,
    destCode: r.dest_code,
    destName: r.dest_name,
    transferDate: toIsoDate(r.transfer_date),
    skuCode: r.sku_code,
    skuName: r.sku_name,
    weightKg: Number(r.weight_kg),
    productGroup: r.product_group,
  }));

  // Latest adjustment wins per route (rows were fetched ordered oldest-first,
  // so a later row for the same key simply overwrites an earlier one here) —
  // this is what makes a user's manual correction survive a later re-upload
  // of ABS0000 for the same week instead of being silently recomputed away.
  const adjustments = new Map<string, ActualAdjustment>();
  for (const r of adjustmentRowsRaw as any[]) {
    const key = matchKey(toIsoDate(r.production_date), r.origin_code, r.dest_code, r.product_group);
    adjustments.set(key, {
      newActual: Number(r.new_actual),
      reason: r.reason,
      adjustedBy: r.adjusted_by,
      adjustedByName: r.adjusted_by_name,
      adjustedAt: r.created_at,
    });
  }

  const { results, unmatchedActual } = computeTracking(planRows, actualRows, adjustments);

  const trackingRows = results.map((r) => ({
    week_id: weekId,
    production_date: r.productionDate,
    origin_code: r.originCode,
    origin_name: r.originName,
    dest_code: r.destCode,
    dest_name: r.destName,
    product_group: r.productGroup,
    origin_price: r.originPrice,
    dest_price: r.destPrice,
    plan_weekly: r.planWeekly,
    plan_daily: r.planDaily,
    plan_total: r.planTotal,
    actual_total: r.actualTotal,
    actual_original: r.actualOriginal,
    is_adjusted: r.isAdjusted,
    adjusted_by: r.adjustedBy,
    adjusted_by_name: r.adjustedByName,
    adjusted_at: r.adjustedAt,
    adjustment_reason: r.adjustmentReason,
    weekly_capped: r.weekly.capped,
    weekly_tolerance_adj: r.weekly.toleranceAdj,
    weekly_diff: r.weekly.diff,
    weekly_pct: r.weekly.pct,
    daily_capped: r.daily.capped,
    daily_tolerance_adj: r.daily.toleranceAdj,
    daily_diff: r.daily.diff,
    daily_pct: r.daily.pct,
    total_capped: r.total.capped,
    total_tolerance_adj: r.total.toleranceAdj,
    total_diff: r.total.diff,
    total_pct: r.total.pct,
    overage: r.overage,
    profit_realized: r.profitRealized,
    profit_lost: r.profitLost,
    suggest_weekly: r.suggestWeekly,
    suggest_daily: r.suggestDaily,
    suggest_total: r.suggestTotal,
    reject_weekly: r.rejectWeekly,
    reject_daily: r.rejectDaily,
    reject_total: r.rejectTotal,
    reject_pct: r.rejectPct,
  }));

  const unmatchedRows = unmatchedActual.map((u) => ({
    week_id: weekId,
    transfer_date: u.transferDate,
    origin_code: u.originCode,
    origin_name: u.originName,
    dest_code: u.destCode,
    dest_name: u.destName,
    product_group: u.productGroup,
    total_weight_kg: u.totalWeightKg,
  }));

  // Recompute is idempotent: wipe this week's prior results, then insert fresh.
  const { error: deleteTrackingError } = await supabase.from('tracking_results').delete().eq('week_id', weekId);
  if (deleteTrackingError) return jsonError(deleteTrackingError.message);

  const { error: deleteUnmatchedError } = await supabase.from('unmatched_actual').delete().eq('week_id', weekId);
  if (deleteUnmatchedError) return jsonError(deleteUnmatchedError.message);

  try {
    await insertInBatches(supabase, 'tracking_results', trackingRows);
    await insertInBatches(supabase, 'unmatched_actual', unmatchedRows);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err));
  }

  // Supply Daily filing tracker: recomputed here too (not a separate button)
  // since its own numbers depend on the exact same plan_rows/actual_rows that
  // just became final above. Soft-fails: an issue here (e.g. master data not
  // seeded yet on a fresh deploy) must never break the plan-vs-actual
  // tracking this endpoint already exists for.
  let supplyDaily: { resultCount: number } | { error: string };
  try {
    supplyDaily = { resultCount: await recomputeSupplyDaily(supabase, weekId, planRows, actualRows) };
  } catch (err) {
    supplyDaily = { error: err instanceof Error ? err.message : String(err) };
  }

  return new Response(
    JSON.stringify({
      trackingRowCount: trackingRows.length,
      unmatchedRowCount: unmatchedRows.length,
      supplyDaily,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});

async function recomputeSupplyDaily(
  supabase: ReturnType<typeof createClient>,
  weekId: string,
  planRows: PlanRow[],
  actualRows: ActualRow[],
): Promise<number> {
  const [supplyRowsRaw, pricingRowsRaw, biddingRowsRaw, zonesRaw, tollPairsRaw, specialSkusRaw, factoriesRaw] =
    await Promise.all([
      fetchAllRows((from, to) => supabase.from('supply_daily_rows').select('*').eq('week_id', weekId).range(from, to)),
      fetchAllRows((from, to) => supabase.from('pricing_rows').select('*').eq('week_id', weekId).range(from, to)),
      fetchAllRows((from, to) => supabase.from('bidding_rows').select('*').eq('week_id', weekId).range(from, to)),
      fetchAllRows((from, to) => supabase.from('mas_factory_zones').select('*').range(from, to)),
      fetchAllRows((from, to) => supabase.from('mas_toll_processing_pairs').select('*').range(from, to)),
      fetchAllRows((from, to) => supabase.from('mas_special_skus').select('*').range(from, to)),
      fetchAllRows((from, to) => supabase.from('mas_factories').select('*').order('id', { ascending: true }).range(from, to)),
    ]);

  const supplyRows: SupplyDailyRow[] = supplyRowsRaw.map((r: any) => ({
    productionDate: toIsoDate(r.production_date),
    originCode: r.origin_code,
    originName: r.origin_name,
    productGroup: r.product_group,
    productGroupCustom: r.product_group_custom,
    remainingQty: Number(r.remaining_qty),
  }));

  const pricingRows: PricingRow[] = pricingRowsRaw.map((r: any) => ({
    priceDate: toIsoDate(r.price_date),
    vendorGroup: r.vendor_group,
    productGroup: r.product_group,
    costZ: Number(r.cost_z),
    margin: Number(r.margin),
    netPrice: Number(r.net_price),
  }));

  const biddingRows: BiddingRow[] = biddingRowsRaw.map((r: any) => ({
    salesDate: toIsoDate(r.sales_date),
    plantCode: r.plant_code,
    productGroup: r.product_group,
    allocateSpType: r.allocate_sp_type,
    isLowBid: Boolean(r.is_low_bid),
  }));

  const factoryZoneByCode = new Map<string, string>();
  for (const r of zonesRaw as any[]) factoryZoneByCode.set(r.plant_code, r.zone);

  // First-match-wins, mirroring XLOOKUP against a table with multiple rows
  // per factory (see mas_factories' own comment). Some rows have no
  // vendor_group at all (real, blank in the source sheet) — skipped so a
  // later, populated row for the same factory can still win.
  const vendorGroupByFactoryCode = new Map<string, string>();
  for (const r of factoriesRaw as any[]) {
    if (!r.vendor_group) continue;
    if (!vendorGroupByFactoryCode.has(r.plant_code)) vendorGroupByFactoryCode.set(r.plant_code, r.vendor_group);
  }

  const tollProcessingPairs = new Set<string>();
  for (const r of tollPairsRaw as any[]) tollProcessingPairs.add(`${r.origin_name}::${r.dest_name}`);

  const specialSkuNames = new Set<string>((specialSkusRaw as any[]).map((r) => r.sku_name));

  const masterData: SupplyDailyMasterData = {
    specialSkuNames,
    tollProcessingPairs,
    factoryZoneByCode,
    vendorGroupByFactoryCode,
  };

  const results = computeSupplyDailyResults(supplyRows, planRows, actualRows, pricingRows, biddingRows, masterData);

  const resultRows = results.map((r) => ({
    week_id: weekId,
    production_date: r.productionDate,
    origin_code: r.originCode,
    origin_name: r.originName,
    product_group: r.productGroup,
    filed: r.filed,
    remaining_qty: r.remainingQty,
    plan_out: r.planOut,
    remaining_after_plan: r.remainingAfterPlan,
    actual_out: r.actualOut,
    is_off_plan: r.isOffPlan,
    is_off_plan_off_zone: r.isOffPlanOffZone,
    is_priced_down_off_plan: r.isPricedDownOffPlan,
    is_low_bid_off_plan: r.isLowBidOffPlan,
    is_priced_down: r.isPricedDown,
    is_low_bid: r.isLowBid,
    origin_zone_unresolved: r.originZoneUnresolved,
    vendor_group_unresolved: r.vendorGroupUnresolved,
  }));

  const { error: deleteError } = await supabase.from('supply_daily_results').delete().eq('week_id', weekId);
  if (deleteError) throw new Error(deleteError.message);

  await insertInBatches(supabase, 'supply_daily_results', resultRows);
  return resultRows.length;
}

async function insertInBatches(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(error.message);
  }
}

function jsonError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
