/**
 * Phone outbox rules — shared by Roam Driver and the Roam Fleet driver section (FO-16).
 * docs/fuel-log-offline-first-audit.md, phone layer.
 *
 * - FO-06: an item is never parked. It retries with growing gaps (1, 5, 15, 60 minutes, then hourly).
 * - FO-07: every send has a time limit, so one stuck call can't stop the rest.
 * - FO-08: items are due on a timer, not only when the phone says it came back online.
 * - FO-14 / S1: the phone's report (how many wait, since when, last error).
 * - FO-18: nothing here removes an item; it leaves only when the server confirms it arrived.
 */

export const OUTBOX_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;
/** After the last step it stays hourly. */
export const OUTBOX_MAX_DELAY_MS = 60 * 60_000;
/** One send (photo uploads + save) may take at most this long. */
export const OUTBOX_SEND_TIMEOUT_MS = 90_000;
/** How often the open app checks for due items. */
export const OUTBOX_TICK_MS = 60_000;

export interface OutboxItemTiming {
  /** When the item was made on the phone (ms). */
  timestamp: number;
  retryCount?: number;
  /** When the next automatic try may start (ms). Missing = due now. */
  nextAttemptAt?: number;
  lastError?: string;
  /** Held until someone changes it (e.g. a trip in a closed week). Still never deleted. */
  held?: boolean;
}

/** FO-06: wait before the next automatic try, after `retryCount` failed tries. */
export function nextRetryDelayMs(retryCount: number): number {
  const n = Math.max(1, Math.floor(retryCount || 0));
  return OUTBOX_RETRY_DELAYS_MS[n - 1] ?? OUTBOX_MAX_DELAY_MS;
}

/** FO-08: may this item be tried now? "Send now" (force) ignores the wait, never a hold. */
export function isOutboxItemDue(item: OutboxItemTiming, nowMs: number, force = false): boolean {
  if (item.held) return false;
  if (force) return true;
  return !(Number(item.nextAttemptAt) > nowMs);
}

/** After a failed try: count it and set the next try. */
export function afterFailedTry(item: OutboxItemTiming, error: string, nowMs: number): Required<Pick<OutboxItemTiming, 'retryCount' | 'nextAttemptAt' | 'lastError'>> {
  const retryCount = (item.retryCount || 0) + 1;
  return {
    retryCount,
    nextAttemptAt: nowMs + nextRetryDelayMs(retryCount),
    lastError: (error || 'Could not send').slice(0, 300),
  };
}

export class OutboxTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} took longer than ${Math.round(ms / 1000)} seconds`);
    this.name = 'OutboxTimeoutError';
  }
}

/** FO-07: give up waiting on `p` after `ms`. The send counts as a failed try. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'Sending'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new OutboxTimeoutError(label, ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface OutboxReport {
  pendingCount: number;
  oldestPendingAt: string | null;
  lastError: string | null;
}

/** S1: the phone's report for Fleet. */
export function buildOutboxReport(items: OutboxItemTiming[]): OutboxReport {
  if (!items.length) return { pendingCount: 0, oldestPendingAt: null, lastError: null };
  const oldest = Math.min(...items.map((i) => Number(i.timestamp) || Date.now()));
  const withError = [...items].reverse().find((i) => i.lastError);
  return {
    pendingCount: items.length,
    oldestPendingAt: new Date(oldest).toISOString(),
    lastError: withError?.lastError ?? null,
  };
}

/** Plain words for the waiting list: "Last try 7:10 AM · no signal". */
export function plainSendError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (/failed to fetch|network|load failed|offline|networkerror/i.test(msg)) return 'no signal';
  if (/took longer than|timed out|timeout|abort/i.test(msg)) return 'signal too weak';
  return msg.slice(0, 200) || 'could not send';
}
