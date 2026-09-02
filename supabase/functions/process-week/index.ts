// Supabase Edge Function: recomputes tracking_results (and unmatched_actual)
// for one week from its current plan_rows / actual_rows. This is the single
// place canonical numbers are produced — the frontend never computes and
// stores tracking numbers itself, it only triggers this function and reads
// the result back.
//
// Deploy: supabase functions deploy process-week
// Invoke:  supabase.functions.invoke('process-week', { body: { weekId } })

import { createClient } from 'npm:@supabase/supabase-js@2';
import { computeTracking } from '../_shared/calcEngine.ts';
import type { ActualRow, PlanRow } from '../_shared/types.ts';

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

  const [{ data: planRowsRaw, error: planError }, { data: actualRowsRaw, error: actualError }] = await Promise.all([
    supabase.from('plan_rows').select('*').eq('week_id', weekId),
    supabase.from('actual_rows').select('*').eq('week_id', weekId),
  ]);

  if (planError) return jsonError(planError.message);
  if (actualError) return jsonError(actualError.message);

  const planRows: PlanRow[] = (planRowsRaw ?? []).map((r) => ({
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

  const actualRows: ActualRow[] = (actualRowsRaw ?? []).map((r) => ({
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

  const { results, unmatchedActual } = computeTracking(planRows, actualRows);

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

  if (trackingRows.length > 0) {
    const { error: insertTrackingError } = await supabase.from('tracking_results').insert(trackingRows);
    if (insertTrackingError) return jsonError(insertTrackingError.message);
  }

  if (unmatchedRows.length > 0) {
    const { error: insertUnmatchedError } = await supabase.from('unmatched_actual').insert(unmatchedRows);
    if (insertUnmatchedError) return jsonError(insertUnmatchedError.message);
  }

  return new Response(
    JSON.stringify({
      trackingRowCount: trackingRows.length,
      unmatchedRowCount: unmatchedRows.length,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});

function jsonError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
