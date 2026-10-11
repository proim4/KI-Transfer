import { useState } from 'react';
import { useCreateWeek, useWeeks } from '../hooks/useWeeks';
import DeleteWeekButton from './DeleteWeekButton';
import type { ProductLine } from '../types/db';

interface WeekSelectorProps {
  value: string | null;
  onChange: (weekId: string) => void;
  productLine: ProductLine;
  /** Shows the inline "+ สร้าง Week ใหม่" form. Off by default so read-only
   * pages (Dashboard/Raw Data/Tracking) get a clean "Week: [ WK36 ▼ ]" —
   * only the Upload page (where a new week's data actually gets created) needs it. */
  allowCreate?: boolean;
  /** With allowCreate: shows "ลบ Week" for the selected week; called once it's deleted so the page can drop it. */
  onWeekDeleted?: () => void;
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

export default function WeekSelector({ value, onChange, productLine, allowCreate = false, onWeekDeleted }: WeekSelectorProps) {
  const { data: weeks, isLoading } = useWeeks(productLine);
  const createWeek = useCreateWeek(productLine);
  const [showCreate, setShowCreate] = useState(false);
  const defaults = currentIsoWeek();
  const [yearNo, setYearNo] = useState(defaults.yearNo);
  const [weekNo, setWeekNo] = useState(defaults.weekNo);
  // null = follow the selected week's own year, so the year filter is always in step with the page's week.
  const [yearFilter, setYearFilter] = useState<number | 'all' | null>(null);

  const selectedWeek = weeks?.find((w) => w.id === value);
  // A picked year that no longer holds the selected week (it changed from outside) yields to the week's own year, so the week dropdown never shows a value missing from its options.
  const effectiveYear =
    yearFilter !== null && (yearFilter === 'all' || !selectedWeek || selectedWeek.year_no === yearFilter)
      ? yearFilter
      : (selectedWeek?.year_no ?? 'all');
  const years = Array.from(new Set((weeks ?? []).map((w) => w.year_no))).sort((a, b) => b - a);
  // Listed by week number, highest first (then year) — useWeeks' own year-first order is kept for picking the default week.
  const visibleWeeks = (weeks ?? [])
    .filter((w) => effectiveYear === 'all' || w.year_no === effectiveYear)
    .sort((a, b) => b.week_no - a.week_no || b.year_no - a.year_no);

  function handleYearChange(raw: string) {
    const next = raw === 'all' ? 'all' : Number(raw);
    setYearFilter(next);
    // Switching to a year that doesn't hold the current week jumps to that year's latest week, so the page never shows a week the dropdown can't.
    if (next !== 'all' && selectedWeek?.year_no !== next) {
      const latest = (weeks ?? []).filter((w) => w.year_no === next).sort((a, b) => b.week_no - a.week_no)[0];
      if (latest) onChange(latest.id);
    }
  }

  async function handleCreate() {
    const week = await createWeek.mutateAsync({ yearNo, weekNo });
    setYearFilter(null);
    onChange(week.id);
    setShowCreate(false);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={String(effectiveYear)}
        onChange={(e) => handleYearChange(e.target.value)}
        disabled={isLoading}
        aria-label="ปี"
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
      >
        <option value="all">ทุกปี</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        aria-label="Week"
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
      >
        <option value="" disabled>
          เลือก Week
        </option>
        {visibleWeeks.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} ({w.year_no})
          </option>
        ))}
      </select>
      {allowCreate && selectedWeek && onWeekDeleted && (
        <DeleteWeekButton
          week={selectedWeek}
          onDeleted={() => {
            setYearFilter(null);
            onWeekDeleted();
          }}
        />
      )}
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
