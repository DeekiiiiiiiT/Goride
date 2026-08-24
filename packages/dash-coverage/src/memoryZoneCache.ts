import type { ZoneCacheStorage } from './zoneCache.ts';
import { createZoneCache } from './zoneCache.ts';

/** In-memory zone cache for admin preview (no localStorage). */
export function createMemoryZoneCache(opts: { key: string; ttlMs: number }) {
  const storage = new Map<string, string>();
  const adapter: ZoneCacheStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
  };
  return createZoneCache({ storage: adapter, key: opts.key, ttlMs: opts.ttlMs });
}

export type MemoryZoneCache = ReturnType<typeof createMemoryZoneCache>;
