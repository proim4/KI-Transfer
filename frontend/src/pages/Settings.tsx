import { useEffect, useState } from 'react';
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

export default function Settings() {
  const { data: settings, isLoading } = useAppSettings();
  const setRequireLogin = useSetRequireLogin();
  const setThresholds = useSetStatusThresholds();

  const [highPct, setHighPct] = useState(100);
  const [lowPct, setLowPct] = useState(90);
  const [highColor, setHighColor] = useState<StatusColor>('green');
  const [midColor, setMidColor] = useState<StatusColor>('amber');
  const [lowColor, setLowColor] = useState<StatusColor>('red');

  useEffect(() => {
    if (!settings) return;
    setHighPct(settings.status_high_pct * 100);
    setLowPct(settings.status_low_pct * 100);
    setHighColor(settings.status_high_color);
    setMidColor(settings.status_mid_color);
    setLowColor(settings.status_low_color);
  }, [settings]);

  if (isLoading || !settings) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  const thresholdsInvalid = lowPct >= highPct;

  function handleSaveThresholds() {
    setThresholds.mutate({
      status_high_pct: highPct / 100,
      status_low_pct: lowPct / 100,
      status_high_color: highColor,
      status_mid_color: midColor,
      status_low_color: lowColor,
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Setting</h1>
        <p className="text-sm text-gray-500">จัดการการตั้งค่าระบบและผู้ใช้งาน</p>
      </div>

      <UserManagementCard />

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <p className="font-medium text-gray-900">บังคับ Login ก่อนใช้งาน</p>
          <p className="text-sm text-gray-500">
            เมื่อปิด ผู้ใช้ทุกคนเข้าใช้งานเว็บแอปนี้ได้โดยไม่ต้องเข้าสู่ระบบ
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.require_login}
          onClick={() => setRequireLogin.mutate(!settings.require_login)}
          disabled={setRequireLogin.isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            settings.require_login ? 'bg-navy-800' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              settings.require_login ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="font-medium text-gray-900">เกณฑ์สถานะ (Status Badge)</p>
        <p className="mb-4 text-sm text-gray-500">
          กำหนดเกณฑ์ % โอนเทียบแผน (Total) และสีที่ใช้แสดงในตาราง Tracking — ไม่กระทบตัวเลขหรือสูตรคำนวณ
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge
              pct={1}
              overage={0}
              thresholds={{ highPct: highPct / 100, lowPct: lowPct / 100, highColor, midColor, lowColor }}
            />
            <span className="text-sm text-gray-500">เมื่อ % โอนเทียบแผน ≥</span>
            <input
              type="number"
              value={highPct}
              onChange={(e) => setHighPct(Number(e.target.value))}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-gray-500">%</span>
            <ColorSelect value={highColor} onChange={setHighColor} />
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge
              pct={lowPct / 100}
              overage={0}
              thresholds={{ highPct: highPct / 100, lowPct: lowPct / 100, highColor, midColor, lowColor }}
            />
            <span className="text-sm text-gray-500">เมื่อ % โอนเทียบแผน ≥</span>
            <input
              type="number"
              value={lowPct}
              onChange={(e) => setLowPct(Number(e.target.value))}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-gray-500">%</span>
            <ColorSelect value={midColor} onChange={setMidColor} />
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge
              pct={0}
              overage={0}
              thresholds={{ highPct: highPct / 100, lowPct: lowPct / 100, highColor, midColor, lowColor }}
            />
            <span className="text-sm text-gray-500">เมื่อ % โอนเทียบแผน ต่ำกว่านั้น</span>
            <ColorSelect value={lowColor} onChange={setLowColor} />
          </div>
        </div>

        {thresholdsInvalid && (
          <p className="mt-3 text-xs text-red-600">เกณฑ์ "ตามแผน" ต้องมากกว่าเกณฑ์ "ต่ำกว่าแผน"</p>
        )}

        <button
          type="button"
          onClick={handleSaveThresholds}
          disabled={thresholdsInvalid || setThresholds.isPending}
          className="mt-4 rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40"
        >
          {setThresholds.isPending ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์'}
        </button>
        {setThresholds.isSuccess && <span className="ml-3 text-sm text-green-600">บันทึกแล้ว</span>}
      </div>
    </div>
  );
}
