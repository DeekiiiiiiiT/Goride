/**
 * Rate Limiter — Enterprise-grade sliding window rate limiting
 * 
 * Protects login and signup routes from brute-force and credential-stuffing attacks.
 * 
 * Architecture:
 *   Layer 1: In-memory Map for sub-millisecond lookups (hot path)
 *   Layer 2: KV Store for persistence across cold starts (write-through on lockout)
 * 
 * Strategy:
 *   - Keyed by IP + portal (e.g. "192.168.1.1:fleet") for general limits
 *   - Keyed by email + portal (e.g. "user@co.com:driver") for per-account limits
 *   - Both must pass for a request to proceed
 *   - On lockout: immediately persists to KV so restarts can't bypass lockouts
 *   - On cold start: checks KV for active lockouts before allowing attempts
 *   - On clear: removes from both memory and KV
 */

import * as kv from "./kv_store.tsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  attempts: number[];          // Timestamps of each attempt within the window
  lockedUntil: number | null;  // If set, requests are blocked until this time
}

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  lockoutMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  retryAfterSec: number;
}

// ---------------------------------------------------------------------------
// Portal configs
// ---------------------------------------------------------------------------

const PORTAL_CONFIGS: Record<string, RateLimitConfig> = {
  fleet: {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
    lockoutMs: 15 * 60 * 1000,
  },
  driver: {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
    lockoutMs: 15 * 60 * 1000,
  },
  admin: {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    lockoutMs: 30 * 60 * 1000,
  },
  signup: {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 5,
    lockoutMs: 60 * 60 * 1000,
  },
};

// ---------------------------------------------------------------------------
// In-memory store (Layer 1)
// ---------------------------------------------------------------------------

const store = new Map<string, RateLimitEntry>();

// KV key prefix for rate limit entries
const KV_PREFIX = "ratelimit:";

// ---------------------------------------------------------------------------
// KV persistence helpers (Layer 2)
// ---------------------------------------------------------------------------

/** Persist a lockout to KV so it survives restarts */
async function persistLockout(fullKey: string, entry: RateLimitEntry): Promise<void> {
  try {
    await kv.set(`${KV_PREFIX}${fullKey}`, {
      lockedUntil: entry.lockedUntil,
      attempts: entry.attempts.slice(-20), // Only persist last 20 timestamps to save space
    });
    console.log(`[RateLimiter] Persisted lockout to KV: ${fullKey} until ${new Date(entry.lockedUntil!).toISOString()}`);
  } catch (e: any) {
    // Non-fatal — memory store is still the source of truth for this instance
    console.log(`[RateLimiter] KV persist failed (non-fatal): ${e.message}`);
  }
}

/** Remove a lockout from KV */
async function removeLockoutFromKV(fullKey: string): Promise<void> {
  try {
    await kv.del(`${KV_PREFIX}${fullKey}`);
  } catch (e: any) {
    console.log(`[RateLimiter] KV delete failed (non-fatal): ${e.message}`);
  }
}

/** Check KV for a persisted lockout (used on cold start / cache miss) */
async function checkKVLockout(fullKey: string): Promise<RateLimitEntry | null> {
  try {
    const stored = await kv.get(`${KV_PREFIX}${fullKey}`) as any;
    if (!stored || !stored.lockedUntil) return null;

    const now = Date.now();
    if (stored.lockedUntil <= now) {
      // Expired lockout — clean it up
      removeLockoutFromKV(fullKey); // fire-and-forget
      return null;
    }

    // Active lockout found — hydrate into memory
    const entry: RateLimitEntry = {
      attempts: stored.attempts || [],
      lockedUntil: stored.lockedUntil,
    };
    store.set(fullKey, entry);
    console.log(`[RateLimiter] Hydrated lockout from KV: ${fullKey} (${Math.ceil((stored.lockedUntil - now) / 1000)}s remaining)`);
    return entry;
  } catch (e: any) {
    console.log(`[RateLimiter] KV read failed (non-fatal): ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cleanup — every 5 minutes, prune expired entries from memory
// ---------------------------------------------------------------------------

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of store.entries()) {
      const hasActiveAttempts = entry.attempts.some(t => now - t < 60 * 60 * 1000);
      const isLocked = entry.lockedUntil && entry.lockedUntil > now;
      if (!hasActiveAttempts && !isLocked) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleanup: removed ${cleaned} expired entries, ${store.size} remaining`);
    }
  }, 5 * 60 * 1000);
}

startCleanup();

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key and portal.
 * On cache miss, checks KV for persisted lockouts (cold-start resilience).
 */
export async function checkRateLimit(
  key: string,
  portal: string,
): Promise<RateLimitResult> {
  const config = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.fleet;
  const fullKey = `${portal}:${key}`;
  const now = Date.now();

  let entry = store.get(fullKey);

  // Cold-start resilience: if not in memory, check KV for persisted lockout
  if (!entry) {
    const kvEntry = await checkKVLockout(fullKey);
    if (kvEntry) {
      entry = kvEntry;
    } else {
      entry = { attempts: [], lockedUntil: null };
      store.set(fullKey, entry);
    }
  }

  // Check active lockout
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const retryAfterMs = entry.lockedUntil - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  // Clear expired lockout
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.lockedUntil = null;
    entry.attempts = [];
    removeLockoutFromKV(fullKey); // fire-and-forget cleanup
  }

  // Prune attempts outside the sliding window
  entry.attempts = entry.attempts.filter(t => now - t < config.windowMs);

  const remaining = Math.max(0, config.maxAttempts - entry.attempts.length);

  return {
    allowed: remaining > 0,
    remaining,
    retryAfterMs: 0,
    retryAfterSec: 0,
  };
}

/**
 * Record a failed attempt. If limit exceeded, triggers lockout and persists to KV.
 */
export async function recordFailedAttempt(
  key: string,
  portal: string,
): Promise<RateLimitResult> {
  const config = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.fleet;
  const fullKey = `${portal}:${key}`;
  const now = Date.now();

  let entry = store.get(fullKey);
  if (!entry) {
    entry = { attempts: [], lockedUntil: null };
    store.set(fullKey, entry);
  }

  // Prune old attempts
  entry.attempts = entry.attempts.filter(t => now - t < config.windowMs);

  // Record new attempt
  entry.attempts.push(now);

  // Check if we've exceeded the limit → trigger lockout
  if (entry.attempts.length >= config.maxAttempts) {
    entry.lockedUntil = now + config.lockoutMs;
    console.log(`[RateLimiter] LOCKOUT triggered for ${fullKey} — locked for ${config.lockoutMs / 1000}s after ${entry.attempts.length} attempts`);

    // Persist to KV so lockout survives cold starts
    await persistLockout(fullKey, entry);

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: config.lockoutMs,
      retryAfterSec: Math.ceil(config.lockoutMs / 1000),
    };
  }

  const remaining = config.maxAttempts - entry.attempts.length;
  return {
    allowed: true,
    remaining,
    retryAfterMs: 0,
    retryAfterSec: 0,
  };
}

/**
 * Clear rate limit for a key (e.g., after successful login).
 * Removes from both memory and KV.
 */
export async function clearRateLimit(key: string, portal: string): Promise<void> {
  const fullKey = `${portal}:${key}`;
  store.delete(fullKey);
  await removeLockoutFromKV(fullKey);
}

/**
 * Get current stats for monitoring/debugging.
 */
export function getRateLimitStats(): {
  totalKeys: number;
  lockedKeys: number;
  portals: Record<string, number>;
} {
  const now = Date.now();
  let lockedKeys = 0;
  const portals: Record<string, number> = {};

  for (const [key, entry] of store.entries()) {
    const portal = key.split(':')[0];
    portals[portal] = (portals[portal] || 0) + 1;
    if (entry.lockedUntil && entry.lockedUntil > now) {
      lockedKeys++;
    }
  }

  return {
    totalKeys: store.size,
    lockedKeys,
    portals,
  };
}

/**
 * Extract client IP from Hono context.
 */
export function getClientIp(c: any): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  );
}
