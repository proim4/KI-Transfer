import { useEffect, useState } from 'react';
import CollapsibleCard from '../components/CollapsibleCard';
import ConfirmDialog from '../components/ConfirmDialog';
import MasterDataCard from '../components/MasterDataCard';
import StatusBadge from '../components/StatusBadge';
import UserManagementCard from '../components/UserManagementCard';
import { useAppSettings, useSetRequireLogin, useSetStatusThresholds } from '../hooks/useAppSettings';
import type { StatusColor } from '../types/db';

const COLOR_OPTIONS: { value: StatusColor; label: string }[] = [
  { value: 'green', label: 'เขียว' },
  { value: 'amber', label: 'เหลือง/ส้ม' },
  { value: 'red', label: 'แดง' },
  { value: 'navy', label: 'กรมท่า' },
  { value: 'blue', label: 'ฟ้า' },
  { value: 'gray', label: 'เทา' },
];

function ColorSelect({ value, onChange }: { value: StatusColor; onChange: (c: StatusColor) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as StatusColor)}
      aria-label="สี"
      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
    >
      {COLOR_OPTIONS.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/** Stored as a 0–1 fraction; shown as a percent rounded to 2 decimals so 0.9 reads 90, not 90.00000000000001. */
function toPercent(fraction: number): number {
  return Math.round(fraction * 10000) / 100;
}

function parsePercent(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

const ROW_CLASS = 'grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5';
const PCT_INPUT_CLASS = 'w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm text-gray-900';

export default function Settings() {
  const { data: settings, isLoading } = useAppSettings();
  const setRequireLogin = useSetRequireLogin();
  const setThresholds = useSetStatusThresholds();
  const [confirmLoginOff, setConfirmLoginOff] = useState(false);

  const [highPct, setHighPct] = useState(100);
  const [lowPct, setLowPct] = useState(90);
  const [highColor, setHighColor] = useState<StatusColor>('green');
  const [midColor, setMidColor] = useState<StatusColor>('amber');
  const [lowColor, setLowColor] = useState<StatusColor>('red');
  const [zeroColor, setZeroColor] = useState<StatusColor>('navy');

  useEffect(() => {
    if (!settings) return;
    setHighPct(toPercent(settings.status_high_pct));
    setLowPct(toPercent(settings.status_low_pct));
    setHighColor(settings.status_high_color);
    setMidColor(settings.status_mid_color);
    setLowColor(settings.status_low_color);
    setZeroColor(settings.status_zero_color);
  }, [settings]);

  if (isLoading || !settings) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  // % โอนเทียบแผน is capped at 100% (never above the plan), so a ตามแผน
  // threshold above 100 could never be reached.
  let thresholdError: string | null = null;
  if (!Number.isFinite(highPct) || !Number.isFinite(lowPct)) thresholdError = 'กรุณากรอกเกณฑ์เป็นตัวเลข';
  else if (highPct > 100) thresholdError = 'เกณฑ์ "ตามแผน" ต้องไม่เกิน 100% (% โอนเทียบแผนสูงสุดคือ 100%)';
  else if (lowPct <= 0) thresholdError = 'เกณฑ์ "ต่ำกว่าแผน" ต้องมากกว่า 0%';
  else if (lowPct >= highPct) thresholdError = 'เกณฑ์ "ตามแผน" ต้องมากกว่าเกณฑ์ "ต่ำกว่าแผน"';

  const thresholdsDirty =
    highPct !== toPercent(settings.status_high_pct) ||
    lowPct !== toPercent(settings.status_low_pct) ||
    highColor !== settings.status_high_color ||
    midColor !== settings.status_mid_color ||
    lowColor !== settings.status_low_color ||
    zeroColor !== settings.status_zero_color;

  function handleSaveThresholds() {
    setThresholds.mutate({
      status_high_pct: highPct / 100,
      status_low_pct: lowPct / 100,
      status_high_color: highColor,
      status_mid_color: midColor,
      status_low_color: lowColor,
      status_zero_color: zeroColor,
    });
  }

  function handleToggleLogin() {
    // Turning login off opens every figure to anyone with the link — confirm first.
    if (settings?.require_login) setConfirmLoginOff(true);
    else setRequireLogin.mutate(true);
  }

  const previewThresholds = {
    highPct: highPct / 100,
    lowPct: lowPct / 100,
    highColor,
    midColor,
    lowColor,
    zeroColor,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">ตั้งค่า (Settings)</h1>
        <p className="text-sm text-gray-500">จัดการผู้ใช้งาน การเข้าสู่ระบบ เกณฑ์สถานะ และ Master Data</p>
      </div>

      <UserManagementCard />

      <CollapsibleCard
        title="บังคับ Login ก่อนใช้งาน"
        summary={settings.require_login ? '(เปิดอยู่)' : '(ปิดอยู่)'}
        storageKey="settings-card-open:login"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">
              {settings.require_login
                ? 'เฉพาะผู้ใช้ที่ Login และสถานะ Active เท่านั้นที่เห็นข้อมูล'
                : 'ทุกคนที่มีลิงก์เข้าดูและแก้ข้อมูลได้โดยไม่ต้อง Login'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.require_login}
            aria-label="บังคับ Login ก่อนใช้งาน"
            onClick={handleToggleLogin}
            disabled={setRequireLogin.isPending}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              settings.require_login ? 'bg-green-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.require_login ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {setRequireLogin.isError && <p className="mt-2 text-sm text-red-600">{(setRequireLogin.error as Error).message}</p>}
      </CollapsibleCard>

      <CollapsibleCard
        title="เกณฑ์สถานะ (Status Badge)"
        summary={`(ตามแผน ≥ ${toPercent(settings.status_high_pct)}% · ต่ำกว่าแผน ≥ ${toPercent(settings.status_low_pct)}%)`}
        description="กำหนดเกณฑ์ % โอนเทียบแผนและสีของสถานะในตาราง Dashboard และหน้าติดตามโอน — ไม่กระทบตัวเลขหรือสูตรคำนวณ"
        storageKey="settings-card-open:thresholds"
      >

        <div className="max-w-2xl divide-y divide-gray-100 rounded-md border border-gray-100">
          <div className={ROW_CLASS}>
            <StatusBadge pct={1} thresholds={previewThresholds} />
            <span className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              ≥
              <input
                id="status-high-pct"
                type="number"
                min={0}
                max={100}
                step="any"
                value={Number.isFinite(highPct) ? highPct : ''}
                onChange={(e) => setHighPct(parsePercent(e.target.value))}
                aria-label="เกณฑ์ตามแผน (%)"
                className={PCT_INPUT_CLASS}
              />
              %
            </span>
            <ColorSelect value={highColor} onChange={setHighColor} />
          </div>

          <div className={ROW_CLASS}>
            <StatusBadge pct={Number.isFinite(lowPct) ? lowPct / 100 : 0.5} thresholds={previewThresholds} />
            <span className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              ≥
              <input
                id="status-low-pct"
                type="number"
                min={0}
                max={100}
                step="any"
                value={Number.isFinite(lowPct) ? lowPct : ''}
                onChange={(e) => setLowPct(parsePercent(e.target.value))}
                aria-label="เกณฑ์ต่ำกว่าแผน (%)"
                className={PCT_INPUT_CLASS}
              />
              % แต่ยังไม่ถึงเกณฑ์ตามแผน
            </span>
            <ColorSelect value={midColor} onChange={setMidColor} />
          </div>

          <div className={ROW_CLASS}>
            <StatusBadge pct={0.001} thresholds={previewThresholds} />
            <span className="text-sm text-gray-600">มากกว่า 0% แต่ต่ำกว่าเกณฑ์ต่ำกว่าแผน</span>
            <ColorSelect value={lowColor} onChange={setLowColor} />
          </div>

          <div className={ROW_CLASS}>
            <StatusBadge pct={0} thresholds={previewThresholds} />
            <span className="text-sm text-gray-600">= 0% (มีแผนแต่ไม่โอนเลย)</span>
            <ColorSelect value={zeroColor} onChange={setZeroColor} />
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-400">
          รายเส้นทางที่ขาดไม่ถึง 10% ของแผนถูกปัดเป็น 100% สถานะ “ต่ำกว่าแผน” จึงพบในยอดรวมบ่อยกว่ารายแถว
        </p>

        {thresholdError && <p className="mt-3 text-sm text-red-600">{thresholdError}</p>}
        {setThresholds.isError && <p className="mt-3 text-sm text-red-600">{(setThresholds.error as Error).message}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveThresholds}
            disabled={thresholdError !== null || !thresholdsDirty || setThresholds.isPending}
            className="rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40"
          >
            {setThresholds.isPending ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์'}
          </button>
          {setThresholds.isSuccess && !thresholdsDirty && <span className="text-sm text-green-600">✓ บันทึกแล้ว</span>}
          {thresholdsDirty && thresholdError === null && (
            <span className="text-sm text-amber-700">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
          )}
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="🗂️ Master Data — ติดตามการกรอก Supply Daily"
        summary="(6 ตาราง)"
        description="ข้อมูลอ้างอิงที่ไม่ต้องอัปโหลดทุกสัปดาห์ แก้ไขเมื่อโรงงานหรือ SKU เปลี่ยน — มีผลกับหน้าติดตามการกรอก Supply Daily หลังกด “ประมวลผล” ของ Week นั้นที่หน้า Upload Data"
        storageKey="settings-card-open:master-data"
      >
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100 px-3">
          <MasterDataCard
            table="mas_factory_zones"
            idField="plant_code"
            title="โรงงาน → ภาค"
            description="ใช้ตรวจว่าการโอนข้ามภาคหรือไม่ (check โอนนอกแผนนอกโซน)"
            fields={[
              { key: 'plant_code', label: 'รหัสโรงงาน', readOnlyOnEdit: true },
              { key: 'warehouse_name', label: 'ชื่อโรงงาน' },
              { key: 'zone', label: 'ภาค' },
            ]}
          />
          <MasterDataCard
            table="mas_factories"
            idField="id"
            title="โรงงาน / กลุ่มราคา"
            description="โรงงาน 1 แห่งอาจมีหลาย Vendor Group/Class Price — ใช้หา Vendor Group สำหรับเทียบราคารายวัน (check ลงราคา)"
            fields={[
              { key: 'plant_code', label: 'รหัสโรงงาน' },
              { key: 'warehouse_name', label: 'ชื่อโรงงาน' },
              { key: 'class_price', label: 'Class Price' },
              { key: 'vendor_group', label: 'Vendor Group' },
              { key: 'class_price_ladder', label: 'Class Price Ladder' },
              { key: 'species', label: 'ชนิดสัตว์' },
            ]}
          />
          <MasterDataCard
            table="mas_toll_processing_pairs"
            idField="id"
            title="คู่โรงงานฝากตัดแต่ง"
            description="คู่ (ต้นทาง,ปลายทาง) ที่ไม่ถือเป็นการโอนปกติ — ไม่นับใน ปริมาณโอนออกจริง"
            fields={[
              { key: 'origin_name', label: 'ชื่อโรงงานต้นทาง' },
              { key: 'dest_name', label: 'ชื่อโรงงานปลายทาง' },
            ]}
          />
          <MasterDataCard
            table="mas_special_skus"
            idField="sku_name"
            title="SKU พิเศษ"
            description="รายชื่อ SKU ที่ไม่นับใน ปริมาณโอนออกจริง (จับคู่ด้วยชื่อ SKU)"
            fields={[{ key: 'sku_name', label: 'ชื่อ SKU', readOnlyOnEdit: true }]}
          />
          <MasterDataCard
            table="mas_sku_representative"
            idField="product_code"
            title="SKU ตัวแทน (สำหรับราคารายวัน)"
            description="ใช้แปลง Product Code ในไฟล์ราคารายวันให้เป็นกลุ่มสินค้า (P19)"
            fields={[
              { key: 'product_code', label: 'รหัสสินค้า', readOnlyOnEdit: true },
              { key: 'product_name', label: 'ชื่อสินค้า' },
              { key: 'plan1', label: 'Plan1' },
              { key: 'plan19', label: 'Plan19 (P19)' },
              { key: 'p19_custom', label: 'P19 Custom' },
              { key: 'in_program', label: 'In Program' },
            ]}
          />
          <MasterDataCard
            table="mas_products"
            idField="product_code"
            title="สินค้า (Mas P19 Cus)"
            description="ใช้แปลง Product Code ในไฟล์ Bidding ให้เป็นกลุ่มสินค้า (P19)"
            fields={[
              { key: 'product_code', label: 'รหัสสินค้า', readOnlyOnEdit: true },
              { key: 'product_name', label: 'ชื่อสินค้า' },
              { key: 'plan1', label: 'Plan1' },
              { key: 'plan7', label: 'Plan7' },
              { key: 'plan19', label: 'Plan19 (P19)' },
              { key: 'plan19_custom', label: 'Plan19 Custom' },
            ]}
          />
        </div>
      </CollapsibleCard>

      {confirmLoginOff && (
        <ConfirmDialog
          title="ปิดการบังคับ Login?"
          message={'เมื่อปิด ทุกคนที่มีลิงก์เว็บนี้จะเข้าดู อัปโหลด และแก้ข้อมูลได้ทันทีโดยไม่ต้อง Login\nรวมถึงหน้าตั้งค่านี้ด้วย'}
          confirmLabel="ปิดการบังคับ Login"
          danger
          onConfirm={() => {
            setRequireLogin.mutate(false);
            setConfirmLoginOff(false);
          }}
          onCancel={() => setConfirmLoginOff(false)}
        />
      )}
    </div>
  );
}
