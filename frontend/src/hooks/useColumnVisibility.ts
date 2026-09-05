import { useState } from 'react';

function loadHidden(storageKey: string | undefined): Set<string> {
  if (!storageKey) return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHidden(storageKey: string | undefined, hidden: Set<string>) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — hiding still works for this session, just isn't remembered.
  }
}

/** Which columns a user has chosen to hide, remembered in localStorage (per browser) — same pattern as useColumnWidths. */
export function useColumnVisibility(storageKey?: string) {
  const [hiddenKeys, setHiddenKeys] = useState(() => loadHidden(storageKey));

  function toggle(key: string) {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHidden(storageKey, next);
      return next;
    });
  }

  return { hiddenKeys, toggle };
}
