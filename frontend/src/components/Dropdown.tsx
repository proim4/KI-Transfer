import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

interface DropdownProps {
  label: ReactNode;
  children: ReactNode;
  /** Close the dropdown as soon as anything inside the panel is clicked — right for a menu of links, wrong for a checklist. Default true. */
  closeOnContentClick?: boolean;
  summaryClassName?: string;
  panelClassName?: string;
}

/**
 * A <details>-based dropdown, fully controlled so it actually closes —
 * native <details> has no built-in "close on outside click" or "close when
 * something inside it is clicked" behavior, despite how natural that seems.
 * Closes on: outside click, Escape, and (by default) any click inside the
 * panel — set closeOnContentClick={false} for a checklist-style panel where
 * clicking an item shouldn't dismiss it.
 */
export default function Dropdown({
  label,
  children,
  closeOnContentClick = true,
  summaryClassName = '',
  panelClassName = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <details ref={ref} open={open} className="relative">
      <summary
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}
      >
        {label}
      </summary>
      <div onClick={closeOnContentClick ? () => setOpen(false) : undefined} className={panelClassName}>
        {children}
      </div>
    </details>
  );
}
