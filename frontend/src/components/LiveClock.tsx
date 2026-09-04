import { useEffect, useState } from 'react';
import { formatDate } from '../lib/formatDateTime';

function formatTimeWithSeconds(date: Date): string {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A ticking clock (updates every second) — shown in the header so any page always shows the current date/time. */
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="hidden items-center gap-1.5 text-sm text-navy-200 sm:inline-flex">
      <span>{formatDate(now.toISOString())}</span>
      <span className="font-mono tabular-nums">{formatTimeWithSeconds(now)}</span>
    </span>
  );
}
