// Input row shapes produced by the Excel parser before they're inserted into
// plan_rows / actual_rows. Kept in sync by hand with
// supabase/functions/_shared/types.ts (PlanRow / ActualRow) — the frontend
// can't import across the Supabase Edge Function's own TS project, so this is
// a deliberate, small duplication rather than a shared package.

export type SourceFile = 'weekly' | 'daily';

export interface PlanRow {
  sourceFile: SourceFile;
  productionDate: string; // ISO 'YYYY-MM-DD'
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  productGroup: string;
  originPrice: number;
  destPrice: number;
  suggest: number;
  supplyAfter: number;
}

export interface ActualRow {
  originCode: string;
  originName: string;
  destCode: string;
  destName: string;
  transferDate: string; // ISO 'YYYY-MM-DD'
  skuCode: string;
  skuName: string;
  weightKg: number;
  productGroup: string;
}
