/**
 * Per driver-week KV lock so two tabs/admins cannot finalize the same statement.
 */
import * as kv from "./kv_store.tsx";

const LOCK_TTL_MS = 5 * 60 * 1000;

export type FuelFinalizeLock = {
  holder: string;
  acquiredAt: number;
  expiresAt: number;
};

function lockKey(weekStartYmd: string, driverId: string): string {
  return `fuel_finalize_lock:${weekStartYmd}:${driverId}`;
}

export async function acquireFuelFinalizeLock(
  weekStartYmd: string,
  driverId: string,
  holder: string,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const key = lockKey(weekStartYmd, driverId);
  const existing = (await kv.get(key)) as FuelFinalizeLock | null;
  if (existing && existing.expiresAt > now && existing.holder !== holder) {
    return { ok: false, retryAfterMs: Math.max(0, existing.expiresAt - now) };
  }
  const lock: FuelFinalizeLock = {
    holder,
    acquiredAt: now,
    expiresAt: now + LOCK_TTL_MS,
  };
  await kv.set(key, lock);
  return { ok: true };
}

export async function releaseFuelFinalizeLock(
  weekStartYmd: string,
  driverId: string,
  holder: string,
): Promise<void> {
  const key = lockKey(weekStartYmd, driverId);
  const existing = (await kv.get(key)) as FuelFinalizeLock | null;
  if (!existing || existing.holder === holder) {
    try {
      await kv.del(key);
    } catch {
      /* ignore */
    }
  }
}
