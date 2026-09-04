import { useEffect, useRef, useState } from 'react';
import { useLatestWeekId } from './useLatestWeekId';

/**
 * Like useState<string | null>(null) for the page's selected week, except it
 * defaults to the latest-uploaded week as soon as that's known, so the user
 * never has to pick a week just to see data. Once the user has picked one
 * themselves (via the returned setter), auto-defaulting stops for good.
 */
export function useDefaultedWeekId(): [string | null, (weekId: string) => void] {
  const [weekId, setWeekId] = useState<string | null>(null);
  const latestWeekId = useLatestWeekId();
  const userPicked = useRef(false);

  useEffect(() => {
    if (!userPicked.current && latestWeekId && weekId === null) {
      setWeekId(latestWeekId);
    }
  }, [latestWeekId, weekId]);

  function onChange(id: string) {
    userPicked.current = true;
    setWeekId(id);
  }

  return [weekId, onChange];
}
