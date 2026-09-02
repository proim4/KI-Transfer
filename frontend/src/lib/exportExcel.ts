import * as XLSX from 'xlsx';
import { aggregateChannel, aggregateReject, buildDailyTrend } from './aggregate';
import { supabase } from './supabase';
import type { TrackingResultRow } from '../types/db';

interface PlanRowDb {
  source_file: 'weekly' | 'daily';
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

interface ActualRowDb {
  transfer_date: string;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
  sku_code: string;
  sku_name: string;
  weight_kg: number;
  product_group: string;
}

function trackingSheetRow(r: TrackingResultRow) {
  return {
    วันที่: r.production_date,
    'รหัสต้นทาง': r.origin_code,
    'โรงงานต้นทาง': r.origin_name,
    'รหัสปลายทาง': r.dest_code,
    'โรงงานปลายทาง': r.dest_name,
    'กลุ่มสินค้า': r.product_group,
    'แผน Weekly (kg)': r.plan_weekly,
    'แผน Daily (kg)': r.plan_daily,
    'แผนรวม (kg)': r.plan_total,
    'โอนจริง (kg)': r.actual_total,
    '% เทียบแผน Weekly': r.weekly_pct,
    '% เทียบแผน Daily': r.daily_pct,
    '% เทียบแผน Total': r.total_pct,
    'โอนเกินแผน (kg)': r.overage,
    'กำไรที่ได้ (บาท)': r.profit_realized,
    'สูญเสียกำไร (บาท)': r.profit_lost,
    'แนะนำ (Suggest) รวม (kg)': r.suggest_total,
    'Reject รวม (kg)': r.reject_total,
    '% Reject': r.reject_pct,
  };
}

function planSheetRow(r: PlanRowDb) {
  return {
    วันที่: r.production_date,
    'รหัสต้นทาง': r.origin_code,
    'โรงงานต้นทาง': r.origin_name,
    'รหัสปลายทาง': r.dest_code,
    'โรงงานปลายทาง': r.dest_name,
    'กลุ่มสินค้า': r.product_group,
    'ราคาต้นทาง': r.origin_price,
    'ราคาปลายทาง': r.dest_price,
    Suggest: r.suggest,
    'แผนสุดท้าย (supplyAfter)': r.supply_after,
  };
}

function actualSheetRow(r: ActualRowDb) {
  return {
    'วันที่โอน': r.transfer_date,
    'รหัสต้นทาง': r.origin_code,
    'ชื่อโรงงานต้นทาง': r.origin_name,
    'รหัสปลายทาง': r.dest_code,
    'ชื่อโรงงานปลายทาง': r.dest_name,
    'รหัสสินค้า': r.sku_code,
    'ชื่อสินค้า': r.sku_name,
    'กลุ่มสินค้า (P19)': r.product_group,
    'น้ำหนัก (KG)': r.weight_kg,
  };
}

export async function exportWeekToExcel(weekId: string, weekLabel: string, trackingResults: TrackingResultRow[]) {
  const [{ data: planRows }, { data: actualRows }] = await Promise.all([
    supabase.from('plan_rows').select('*').eq('week_id', weekId),
    supabase.from('actual_rows').select('*').eq('week_id', weekId),
  ]);

  const weekly = aggregateChannel(trackingResults, 'weekly');
  const daily = aggregateChannel(trackingResults, 'daily');
  const total = aggregateChannel(trackingResults, 'total');
  const reject = aggregateReject(trackingResults, 'total');
  const dailyTrend = buildDailyTrend(trackingResults);

  const summaryRows = [
    { KPI: '% โอนเทียบแผน Weekly', 'ค่า': weekly.pct },
    { KPI: '% โอนเทียบแผน Daily', 'ค่า': daily.pct },
    { KPI: '% โอนเทียบแผน Total', 'ค่า': total.pct },
    { KPI: 'ปริมาณแผนโอน (kg)', 'ค่า': total.planSum },
    { KPI: 'ปริมาณโอนจริง (kg)', 'ค่า': trackingResults.reduce((a, r) => a + Number(r.actual_total), 0) },
    { KPI: 'ปริมาณโอนจริงตามแผน (kg)', 'ค่า': total.toleranceAdjSum },
    { KPI: 'ปริมาณ Reject (kg)', 'ค่า': reject.rejectSum },
    { KPI: '% Reject', 'ค่า': reject.pct },
    {
      KPI: 'มูลค่าสูญเสีย (บาท)',
      'ค่า': trackingResults.reduce((a, r) => a + Number(r.profit_lost), 0),
    },
  ];

  const trendRows = dailyTrend.map((d) => ({
    วันที่: d.date,
    '% Weekly': d.weeklyPct,
    '% Daily': d.dailyPct,
    '% Total': d.totalPct,
    'แผนรวม (kg)': d.planTotal,
    'จริงรวม (kg)': d.actualTotal,
  }));

  const lossAnalysisRows = [...trackingResults]
    .filter((r) => r.profit_lost < 0)
    .sort((a, b) => a.profit_lost - b.profit_lost)
    .map(trackingSheetRow);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trendRows), 'Daily Trend');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(trackingResults.map(trackingSheetRow)),
    'Tracking Detail',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet((planRows ?? []).filter((r) => r.source_file === 'weekly').map(planSheetRow)),
    'Weekly Plan',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet((planRows ?? []).filter((r) => r.source_file === 'daily').map(planSheetRow)),
    'Daily Plan',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet((actualRows ?? []).map(actualSheetRow)),
    'Actual Transfer',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lossAnalysisRows), 'Loss Analysis');

  XLSX.writeFile(workbook, `Tracking_${weekLabel}.xlsx`);
}
