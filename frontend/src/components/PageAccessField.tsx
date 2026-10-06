import { PAGE_AREAS, toggleArea, type PageArea } from '../lib/pageAccess';

interface PageAccessFieldProps {
  value: Set<PageArea>;
  onChange: (value: Set<PageArea>) => void;
}

/** "สิทธิ์การเข้าถึง" checkboxes for one user — ทั้งหมด also ticks ไก่ + หมู, ตั้งค่า (Admin) ticks everything. */
export default function PageAccessField({ value, onChange }: PageAccessFieldProps) {
  const isAdmin = value.has('settings');
  return (
    <fieldset className="mb-3">
      <legend className="mb-1 block text-sm text-gray-600">สิทธิ์การเข้าถึงหน้า</legend>
      <div className="grid grid-cols-2 gap-2">
        {PAGE_AREAS.map((a) => {
          const locked = isAdmin && a.key !== 'settings';
          return (
            <label
              key={a.key}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                value.has(a.key) ? 'border-navy-300 bg-navy-50 text-gray-900' : 'border-gray-200 bg-white text-gray-600'
              } ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={value.has(a.key)}
                disabled={locked}
                onChange={(e) => onChange(toggleArea(value, a.key, e.target.checked))}
                className="h-4 w-4 accent-navy-700"
              />
              {a.label}
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        ทั้งหมด = เห็นทั้งไก่และหมู · ตั้งค่า = ผู้ดูแลระบบ (Admin) เข้าได้ทุกหน้า และจัดการผู้ใช้/เกณฑ์สถานะ/Master Data
      </p>
    </fieldset>
  );
}
