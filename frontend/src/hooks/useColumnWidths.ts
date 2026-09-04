import { useCallback, useEffect, useRef, useState } from 'react';

/** A reasonable starting width guess from the header label alone — the user drags from there. */
export function defaultColumnWidth(label: string): number {
  return Math.min(260, Math.max(90, label.length * 9 + 32));
}

function loadStoredWidths(storageKey: string | undefined): Record<string, number> | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredWidths(storageKey: string | undefined, widths: Record<string, number>) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — resizing still works for this session, just isn't remembered.
  }
}

/**
 * Drag-to-resize column widths, shared by every data table in the app. When
 * `storageKey` is given, the widths a user drags to are remembered in
 * localStorage (per browser) and restored on the next visit — until the user
 * drags again, they stay exactly where left. Registers the mousemove/mouseup
 * listeners once (not per drag-start) and gates on a ref so there's no
 * listener churn while dragging.
 */
export function useColumnWidths(initialWidths: Record<string, number>, storageKey?: string, minWidth = 60) {
  const [widths, setWidths] = useState(() => {
    const stored = loadStoredWidths(storageKey);
    return stored ? { ...initialWidths, ...stored } : initialWidths;
  });
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // New columns (e.g. switching tabs to a different column set) get a width; existing ones keep whatever the user dragged them to.
  useEffect(() => {
    setWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, width] of Object.entries(initialWidths)) {
        if (!(key in next)) {
          next[key] = width;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(initialWidths).join('|')]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const newWidth = Math.max(minWidth, drag.startWidth + (e.clientX - drag.startX));
      setWidths((w) => ({ ...w, [drag.key]: newWidth }));
    }
    function onUp() {
      // Persist once, at drag end, rather than on every mousemove — a resize
      // drag can fire dozens of moves, and only the final width matters.
      if (dragRef.current) saveStoredWidths(storageKey, widthsRef.current);
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [minWidth, storageKey]);

  const startResize = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { key, startX: e.clientX, startWidth: widths[key] ?? 140 };
    },
    [widths],
  );

  return { widths, startResize };
}
