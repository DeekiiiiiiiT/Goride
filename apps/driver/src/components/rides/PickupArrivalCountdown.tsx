import React, { useEffect, useState } from 'react';
import { DEFAULT_ARRIVAL_DWELL_SECONDS } from './rideGeofenceClient';

type Props = {
  waitTimeStartedAt: string | null | undefined;
  dwellSeconds?: number;
};

/** Countdown until server auto-confirms arrival (dwell timer). */
export function PickupArrivalCountdown({ waitTimeStartedAt, dwellSeconds = DEFAULT_ARRIVAL_DWELL_SECONDS }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!waitTimeStartedAt?.trim()) {
      setRemaining(null);
      return;
    }
    const startedMs = Date.parse(waitTimeStartedAt);
    if (!Number.isFinite(startedMs)) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - startedMs) / 1000;
      setRemaining(Math.max(0, Math.ceil(dwellSeconds - elapsed)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => clearInterval(id);
  }, [waitTimeStartedAt, dwellSeconds]);

  if (remaining == null) return null;
  if (remaining <= 0) {
    return (
      <p className="mb-3 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Confirming arrival…
      </p>
    );
  }

  return (
    <p className="mb-3 text-center text-xs text-slate-600 dark:text-slate-400">
      Auto-arrival in{' '}
      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
        {remaining}s
      </span>
      {remaining <= 5 ? ' — tap I&apos;ve arrived if needed' : null}
    </p>
  );
}
