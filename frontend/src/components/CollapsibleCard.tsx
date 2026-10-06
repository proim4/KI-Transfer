import { useState, type ReactNode } from 'react';

interface CollapsibleCardProps {
  title: ReactNode;
  /** Short state shown next to the title even while folded (e.g. "3 ผู้ใช้", "เปิดอยู่"). */
  summary?: ReactNode;
  description?: ReactNode;
  /** Buttons on the header's right — only while open, since they act on the hidden content. */
  actions?: ReactNode;
  /** localStorage key that remembers open/folded per viewer; omit to not remember. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** card: a standalone bordered box. row: a divider-separated item inside another card. */
  variant?: 'card' | 'row';
  children: ReactNode;
}

function readOpen(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  try {
    const v = localStorage.getItem(storageKey);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

/** A Settings-page card whose body folds away by clicking its header. */
export default function CollapsibleCard({
  title,
  summary,
  description,
  actions,
  storageKey,
  defaultOpen = true,
  variant = 'card',
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {
          // storage unavailable — folding still works for this visit
        }
      }
      return next;
    });
  }

  return (
    <div className={variant === 'card' ? 'rounded-lg border border-gray-200 bg-white p-4' : 'py-3'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={toggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className={`flex items-center gap-2 ${variant === 'card' ? 'font-medium' : 'text-sm font-medium'} text-gray-900`}>
            <span className="w-3 text-sm text-gray-500">{open ? '▾' : '▸'}</span>
            {title}
            {summary && <span className="text-xs font-normal text-gray-400">{summary}</span>}
          </span>
          {description && (open || variant === 'row') && (
            <span className={`mt-0.5 block pl-5 text-gray-500 ${variant === 'card' ? 'text-sm' : 'text-xs'}`}>{description}</span>
          )}
        </button>
        {open && actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
