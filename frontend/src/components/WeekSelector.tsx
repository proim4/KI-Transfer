import { useState } from 'react';
import { useCreateWeek, useWeeks } from '../hooks/useWeeks';

interface WeekSelectorProps {
  value: string | null;
  onChange: (weekId: string) => void;
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

export default function WeekSelector({ value, onChange }: WeekSelectorProps) {
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
        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
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
      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
          + สร้าง Week ใหม่
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-gray-300 p-2">
          <input
            type="number"
            value={yearNo}
            onChange={(e) => setYearNo(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
            aria-label="ปี"
          />
          <span className="text-sm text-gray-500">WK</span>
          <input
            type="number"
            value={weekNo}
            onChange={(e) => setWeekNo(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            aria-label="สัปดาห์ที่"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={createWeek.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            สร้าง
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-gray-500">
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  );
}
