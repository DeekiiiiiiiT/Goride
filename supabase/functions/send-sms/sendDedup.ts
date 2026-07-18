/**
 * In-memory idempotency guard for the Send SMS hook.
 *
 * Supabase (and Standard Webhooks generally) can redeliver the same hook —
 * network hiccups, at-least-once delivery, client retries — which would fire a
 * SECOND identical OTP text (extra cost + confusing UX). We suppress a repeat
 * send for the same key within a short TTL window.
 *
 * The key is only RECORDED after a send actually succeeds, so a genuine retry
 * following a carrier failure is NOT swallowed. State is per-instance and
 * ephemeral by design: it only needs to cover the seconds-long redelivery
 * window, and OTPs are themselves short-lived.
 */
const seen = new Map<string, number>(); // key -> expiry epoch ms

function prune(nowMs: number): void {
  for (const [k, exp] of seen) {
    if (exp <= nowMs) seen.delete(k);
  }
}

/** True if this key was recorded as sent within its (unexpired) TTL window. */
export function wasRecentlySent(key: string, nowMs: number = Date.now()): boolean {
  prune(nowMs);
  const exp = seen.get(key);
  return exp !== undefined && exp > nowMs;
}

/** Record a successful send so identical redeliveries within `ttlMs` are suppressed. */
export function recordSent(key: string, ttlMs: number, nowMs: number = Date.now()): void {
  seen.set(key, nowMs + ttlMs);
}

/** Test-only: clear all recorded keys. */
export function _resetForTest(): void {
  seen.clear();
}
