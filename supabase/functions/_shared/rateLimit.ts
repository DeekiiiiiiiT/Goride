/**
 * Best-effort rate limiting for Edge Functions.
 *
 * Prefer Deno KV when available (atomic counters across warm isolates on the same
 * deployment). Falls back to an in-memory Map per isolate.
 *
 * Future: swap the KV backend for Redis/Upstash when multi-region consistency is required.
 */

export type RateLimitOptions = {
  /** Max requests allowed in the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

type Bucket = { timestamps: number[] };

const memoryBuckets = new Map<string, Bucket>();

let kvPromise: Promise<Deno.Kv | null> | null = null;

async function tryOpenKv(): Promise<Deno.Kv | null> {
  if (kvPromise) return kvPromise;
  kvPromise = (async () => {
    try {
      // Deno.openKv is optional on some Edge runtimes (e.g. some Supabase hosts).
      const openKv = (Deno as unknown as { openKv?: () => Promise<Deno.Kv> }).openKv;
      if (typeof openKv !== "function") return null;
      return await openKv();
    } catch {
      // Documented fallback — Redis/Upstash later for cross-isolate consistency.
      return null;
    }
  })();
  return kvPromise;
}

function allowInMemory(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(key) ?? { timestamps: [] };
  const fresh = bucket.timestamps.filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    memoryBuckets.set(key, { timestamps: fresh });
    return false;
  }
  fresh.push(now);
  memoryBuckets.set(key, { timestamps: fresh });
  return true;
}

async function allowWithKv(
  kv: Deno.Kv,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const kvKey = ["rate_limit", key];
  const entry = await kv.get<number[]>(kvKey);
  const fresh = (entry.value ?? []).filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    await kv.set(kvKey, fresh, { expireIn: windowMs });
    return false;
  }
  fresh.push(now);
  await kv.set(kvKey, fresh, { expireIn: windowMs });
  return true;
}

/**
 * Returns true if the request is allowed; false if rate-limited.
 * Sliding window of timestamps (best-effort).
 */
export async function allowRequest(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const kv = await tryOpenKv();
  if (kv) {
    try {
      return await allowWithKv(kv, key, max, windowMs);
    } catch {
      return allowInMemory(key, max, windowMs);
    }
  }
  return allowInMemory(key, max, windowMs);
}

/** Sync helper matching rides' existing `rateLimit(key, max, windowMs)` signature. */
export function rateLimitSync(key: string, max: number, windowMs: number): boolean {
  return allowInMemory(key, max, windowMs);
}

/**
 * Hono-friendly check after auth: 429 JSON if over limit.
 * Example: `if (!(await assertRateLimit(c, \`payments:intents:${user.id}\`, { max: 20, windowMs: 60_000 }))) return;`
 */
export async function assertRateLimit(
  c: {
    json: (body: unknown, status?: number) => Response;
  },
  key: string,
  opts: RateLimitOptions,
): Promise<Response | null> {
  const ok = await allowRequest(key, opts.max, opts.windowMs);
  if (ok) return null;
  return c.json({ error: "rate_limited", retry_after_ms: opts.windowMs }, 429);
}
