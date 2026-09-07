import type { ReactNode } from 'react';
import type { SupplyDailyResultRow } from '../types/db';

interface SupplyDailyDetailModalProps {
  row: SupplyDailyResultRow;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-gray-100 py-3 first:border-t-0 first:pt-0">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function resultBadge(r: SupplyDailyResultRow) {
  const problems: string[] = [];
  if (r.is_off_plan) problems.push('โอนนอกแผน');
  if (r.is_off_plan_off_zone > 0) problems.push('นอกแผนนอกโซน');
  if (r.is_priced_down_off_plan) problems.push('ลงราคาแล้วนอกแผน');
  if (r.is_low_bid_off_plan) problems.push('Bidding แล้วนอกระบบ');
  if (!r.filed) problems.push('ไม่ได้กรอก Supply');
  const unresolved = r.origin_zone_unresolved || r.vendor_group_unresolved;

  if (problems.length > 0) {
    return { dot: 'bg-red-500', text: 'text-red-700', label: `⚠️ ${problems.join(', ')}` };
  }
  if (unresolved) {
    return { dot: 'bg-amber-500', text: 'text-amber-700', label: '⚠️ ไม่สามารถ Match ข้อมูลได้ (Master Data ไม่ครบ)' };
  }
  return { dot: 'bg-green-500', text: 'text-green-700', label: 'ปกติ' };
}

/** End-to-end trace for one Supply Daily key — modeled on ConfirmDialog's overlay chrome (this app has no generic Modal component). */
export default function SupplyDailyDetailModal({ row, onClose }: SupplyDailyDetailModalProps) {
  const badge = resultBadge(row);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {row.origin_name} · {row.product_group}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <Section title="Supply Daily">
          <Field label="วันที่" value={row.production_date} />
          <Field label="โรงงาน" value={`${row.origin_code} · ${row.origin_name}`} />
          <Field label="กลุ่มสินค้า" value={row.product_group} />
          <Field label="กรอก Supply" value={row.filed ? '✓ กรอกแล้ว' : '✗ ไม่ได้กรอก'} />
          <Field label="ปริมาณของเหลือ" value={row.remaining_qty.toLocaleString('en-US')} />
        </Section>

        <Section title="Bidding / ลงราคา">
          <Field label="Bidding" value={row.is_low_bid ? 'มี' : '-'} />
          <Field label="Bidding นอกระบบ" value={row.is_low_bid_off_plan ? '⚠ ใช่' : '-'} />
          <Field label="ลงราคา" value={row.is_priced_down ? 'มี' : '-'} />
          <Field label="ลงราคาแล้วนอกแผน" value={row.is_priced_down_off_plan ? '⚠ ใช่' : '-'} />
        </Section>

        <Section title="แผนโอน / โอนจริง">
          <Field label="แผนโอนออก" value={row.plan_out.toLocaleString('en-US')} />
          <Field label="โอนออกจริง" value={row.actual_out.toLocaleString('en-US')} />
          <Field label="เหลือหลังหักแผน" value={row.remaining_after_plan.toLocaleString('en-US')} />
          <Field label="โอนนอกแผน" value={row.is_off_plan ? `⚠ ใช่ (นอกโซน ${row.is_off_plan_off_zone})` : '-'} />
        </Section>

        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Result</p>
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${badge.text}`}>
            <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
