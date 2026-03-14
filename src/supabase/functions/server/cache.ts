import * as kv from "./kv_store.tsx";
import { Buffer } from "node:buffer";

// --- Retry helper for transient Supabase connection resets ---
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 200): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      const isTransient = msg.includes("connection reset") || msg.includes("connection error") || msg.includes("SendRequest");
      if (isTransient && attempt < maxRetries) {
        console.log(`[cache] Transient error on attempt ${attempt}/${maxRetries}, retrying in ${delayMs}ms: ${msg}`);
        await new Promise(r => setTimeout(r, delayMs * attempt)); // linear backoff
        continue;
      }
      throw err;
    }
  }
  throw new Error("[cache] withRetry exhausted (should not reach here)");
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // in seconds
}

/**
 * Generates a deterministic cache key based on a prefix and a params object.
 * It sorts the object keys to ensure {a:1, b:2} produces the same hash as {b:2, a:1}.
 */
export async function generateKey(prefix: string, params: any): Promise<string> {
  // 1. Sort object keys recursively to ensure determinism
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortKeys);
    }
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key: string) => {
        result[key] = sortKeys(obj[key]);
        return result;
      }, {});
  };

  const sortedParams = sortKeys(params);
  const jsonString = JSON.stringify(sortedParams);
  
  // 2. Hash the string using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  
  // Convert buffer to hex string using Buffer
  const hash = Buffer.from(hashBuffer).toString('hex');

  return `${prefix}:${hash}`;
}

/**
 * Retrieves a value from the cache.
 * Returns null if the key doesn't exist or has expired.
 * Lazily deletes expired keys.
 */
export async function getCache(key: string): Promise<any | null> {
  try {
    const entry = await withRetry(() => kv.get(key));
    
    if (!entry) {
      return null;
    }

    // Check for expiration
    const now = Date.now();
    const expiryTime = entry.timestamp + (entry.ttl * 1000);

    if (now > expiryTime) {
      // Lazy delete
      // We don't await this because we want to return fast
      kv.del(key).catch(e => console.error(`Failed to lazy delete cache key ${key}:`, e));
      return null;
    }

    return entry.data;
  } catch (e) {
    console.error(`Cache read error for key ${key}:`, e);
    return null;
  }
}

/**
 * Sets a value in the cache with a Time To Live (TTL).
 */
export async function setCache(key: string, data: any, ttlSeconds: number): Promise<void> {
  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds
    };
    await withRetry(() => kv.set(key, entry));
  } catch (e) {
    console.error(`Cache write error for key ${key}:`, e);
  }
}

/**
 * Gets the current global version for a specific cache scope (e.g., 'stats').
 * If no version exists, it initializes it to 'v1'.
 */
export async function getCacheVersion(scope: string): Promise<string> {
  const key = `config:cache_version:${scope}`;
  let version = await withRetry(() => kv.get(key));
  if (!version) {
    version = "v1";
    await withRetry(() => kv.set(key, version));
  }
  return version;
}

/**
 * Increments the global version for a scope, effectively invalidating all previous keys
 * that used that version number in their prefix.
 */
export async function invalidateCacheVersion(scope: string): Promise<string> {
  const key = `config:cache_version:${scope}`;
  const timestamp = Date.now();
  const newVersion = `v${timestamp}`; // Use timestamp to ensure uniqueness
  await withRetry(() => kv.set(key, newVersion));
  return newVersion;
}