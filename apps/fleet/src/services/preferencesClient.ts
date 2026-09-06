/**
 * Shared GET settings/preferences — BusinessConfig + tierService fan-out both need it.
 * One in-flight request + short TTL so driver financial deep-links don't stack
 * identical HTTP/1.1 preference calls (ROAM-FLEET-10).
 */

const CACHE_TTL_MS = 60_000;

let inflight: Promise<any> | null = null;
let cache: { at: number; data: any } | null = null;

export function clearPreferencesCache() {
  cache = null;
  inflight = null;
}

export function peekPreferencesCache(): any | null {
  if (!cache) return null;
  if (Date.now() - cache.at >= CACHE_TTL_MS) return null;
  return cache.data;
}

/** Seed / refresh cache after a successful fetch or save. */
export function seedPreferencesCache(data: any) {
  cache = { at: Date.now(), data };
}

export async function fetchPreferencesCached(
  loader: () => Promise<any>,
): Promise<any> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await loader();
      cache = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
