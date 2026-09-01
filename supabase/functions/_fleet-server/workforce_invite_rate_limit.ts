/**
 * Workforce invite accept — per-user rate limit (defence in depth).
 * Uses KV when available; falls back to per-isolate memory.
 */
import * as kv from "./kv_store.tsx";

const ACCEPT_LIMIT = 20;
const ACCEPT_WINDOW_MS = 15 * 60 * 1000;
const KV_PREFIX = "workforce_invite_accept:";
const acceptAttempts = new Map<string, { count: number; resetAt: number }>();

export async function checkAcceptRateLimit(userId: string): Promise<boolean> {
  const now = Date.now();
  const key = `${KV_PREFIX}${userId}`;

  try {
    const stored = await kv.get(key) as { count?: number; resetAt?: number } | null;
    if (!stored || typeof stored.resetAt !== "number" || now > stored.resetAt) {
      await kv.set(key, { count: 1, resetAt: now + ACCEPT_WINDOW_MS });
      return true;
    }
    if ((stored.count ?? 0) >= ACCEPT_LIMIT) return false;
    await kv.set(key, { count: (stored.count ?? 0) + 1, resetAt: stored.resetAt });
    return true;
  } catch {
    // Isolate fallback — not a global limit across warm instances.
    const entry = acceptAttempts.get(userId);
    if (!entry || now > entry.resetAt) {
      acceptAttempts.set(userId, { count: 1, resetAt: now + ACCEPT_WINDOW_MS });
      return true;
    }
    if (entry.count >= ACCEPT_LIMIT) return false;
    entry.count += 1;
    return true;
  }
}
