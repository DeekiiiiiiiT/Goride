import React, { useEffect, useState } from 'react';

export type GracePeriodWaitTime = {
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
};

/** Matches default `wait_time_grace_minutes` when API wait_time is unavailable. */
const FALLBACK_GRACE_MINUTES = 2;

function formatGraceClock(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export function isGracePeriodActive(
  waitTime: GracePeriodWaitTime | null | undefined,
  graceStartedAt: string | null | undefined,
): boolean {
  if (!graceStartedAt?.trim()) return false;
  return initialSeconds(waitTime, graceStartedAt) > 0;
}

function initialSeconds(
  waitTime: GracePeriodWaitTime | null | undefined,
  graceStartedAt: string | null | undefined,
): number {
  if (waitTime?.wait_time_grace_expired) return 0;
  if (
    waitTime?.wait_time_grace_remaining_seconds != null &&
    Number.isFinite(waitTime.wait_time_grace_remaining_seconds)
  ) {
    return Math.max(0, Math.ceil(waitTime.wait_time_grace_remaining_seconds));
  }
  if (!graceStartedAt?.trim()) return 0;
  const startedMs = Date.parse(graceStartedAt);
  if (!Number.isFinite(startedMs)) return 0;
  const endMs = startedMs + FALLBACK_GRACE_MINUTES * 60 * 1000;
  return Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
}

type Props = {
  waitTimeInfo?: GracePeriodWaitTime | null;
  graceStartedAt?: string | null;
};

/** Shows `Grace Period MM:SS` while grace is active; hides when it reaches zero. */
export function GracePeriodCountdown({ waitTimeInfo, graceStartedAt }: Props) {
  const [remainingSecs, setRemainingSecs] = useState(() =>
    initialSeconds(waitTimeInfo, graceStartedAt),
  );

  useEffect(() => {
    setRemainingSecs(initialSeconds(waitTimeInfo, graceStartedAt));
  }, [
    waitTimeInfo?.wait_time_grace_remaining_seconds,
    waitTimeInfo?.wait_time_grace_expired,
    graceStartedAt,
  ]);

  useEffect(() => {
    if (remainingSecs <= 0) return;
    const t = window.setInterval(() => {
      setRemainingSecs((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [remainingSecs > 0]);

  if (remainingSecs <= 0 || waitTimeInfo?.wait_time_grace_expired) {
    return null;
  }

  if (!graceStartedAt?.trim() && waitTimeInfo?.wait_time_grace_remaining_seconds == null) {
    return null;
  }

  return (
    <p
      className="mb-4 text-center text-sm font-semibold tabular-nums tracking-wide text-slate-700 dark:text-slate-200"
      aria-live="polite"
    >
      Grace Period {formatGraceClock(remainingSecs)}
    </p>
  );
}
