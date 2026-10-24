/** Per-isolate access cache. Seat and membership writes call invalidateAccessCache. */

const TTL_MS = 60_000;

type Entry = { exp: number; value: unknown };

const cache = new Map<string, Entry>();

export function readAccessCache<T>(userId: string): T | null {
  const row = cache.get(userId);
  if (!row) return null;
  if (row.exp <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return row.value as T;
}

export function writeAccessCache(userId: string, value: unknown): void {
  cache.set(userId, { exp: Date.now() + TTL_MS, value });
}

export function invalidateAccessCache(userId: string): void {
  if (userId) cache.delete(userId);
}
