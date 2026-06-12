import { useEffect, useState } from 'react';

const STORAGE_KEY = 'roam:driver:online-since';

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Elapsed time for the current online session (resets when driver goes offline). */
export function useOnlineSessionDuration(online: boolean): string {
  const [since, setSince] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!online) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setSince(null);
      return;
    }

    let start = Date.now();
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) start = parsed;
      } else {
        sessionStorage.setItem(STORAGE_KEY, String(start));
      }
    } catch {
      /* ignore */
    }
    setSince(start);
  }, [online]);

  useEffect(() => {
    if (!online || since == null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [online, since]);

  void tick;
  if (!online || since == null) return '0m';
  return formatDuration(Date.now() - since);
}
