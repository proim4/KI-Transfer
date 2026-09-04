import { useState } from 'react';
import { useCreateWeek, useWeeks } from '../hooks/useWeeks';

interface WeekSelectorProps {
  value: string | null;
  onChange: (weekId: string) => void;
  /** Shows the inline "+ สร้าง Week ใหม่" form. Off by default so read-only
   * pages (Dashboard/Raw Data/Tracking) get a clean "Week: [ WK36 ▼ ]" —
   * only the Upload page (where a new week's data actually gets created) needs it. */
  allowCreate?: boolean;
}

function currentIsoWeek(): { yearNo: number; weekNo: number } {
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNo = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return { yearNo: target.getUTCFullYear(), weekNo };
}

export default function WeekSelector({ value, onChange, allowCreate = false }: WeekSelectorProps) {
  const { data: weeks, isLoading } = useWeeks();
  const createWeek = useCreateWeek();
  const [showCreate, setShowCreate] = useState(false);
  const defaults = currentIsoWeek();
  const [yearNo, setYearNo] = useState(defaults.yearNo);
  const [weekNo, setWeekNo] = useState(defaults.weekNo);

  async function handleCreate() {
    const week = await createWeek.mutateAsync({ yearNo, weekNo });
    onChange(week.id);
    setShowCreate(false);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
      >
        <option value="" disabled>
          เลือก Week
        </option>
        {weeks?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} ({w.year_no})
          </option>
        ))}
      </select>
      {allowCreate &&
        (!showCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
          >
            + สร้าง Week ใหม่
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white p-2">
            <input
              type="number"
              value={yearNo}
              onChange={(e) => setYearNo(Number(e.target.value))}
              className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
              aria-label="ปี"
            />
            <span className="text-sm text-gray-500">WK</span>
            <input
              type="number"
              value={weekNo}
              onChange={(e) => setWeekNo(Number(e.target.value))}
              className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
              aria-label="สัปดาห์ที่"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createWeek.isPending}
              className="rounded-md bg-navy-800 px-3 py-1.5 text-sm text-white hover:bg-navy-900 disabled:opacity-50"
            >
              สร้าง
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-gray-500">
              ยกเลิก
            </button>
          </div>
        ))}
    </div>
  );
}
