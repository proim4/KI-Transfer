import { useCallback, useEffect, useRef, useState } from 'react';

/** A reasonable starting width guess from the header label alone — the user drags from there. */
export function defaultColumnWidth(label: string): number {
  return Math.min(260, Math.max(90, label.length * 9 + 32));
}

/**
 * Drag-to-resize column widths, shared by every data table in the app.
 * Registers the mousemove/mouseup listeners once (not per drag-start) and
 * gates on a ref so there's no listener churn while dragging.
 */
export function useColumnWidths(initialWidths: Record<string, number>, minWidth = 60) {
  const [widths, setWidths] = useState(initialWidths);
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
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [minWidth]);

  const startResize = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { key, startX: e.clientX, startWidth: widths[key] ?? 140 };
    },
    [widths],
  );

  return { widths, startResize };
}
