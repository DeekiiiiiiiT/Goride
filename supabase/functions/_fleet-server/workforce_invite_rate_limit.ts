/**
 * Workforce invite accept — per-user rate limit (defence in depth).
 */
const acceptAttempts = new Map<string, { count: number; resetAt: number }>();
const ACCEPT_LIMIT = 20;
const ACCEPT_WINDOW_MS = 15 * 60 * 1000;

function checkAcceptRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = acceptAttempts.get(userId);
  if (!entry || now > entry.resetAt) {
    acceptAttempts.set(userId, { count: 1, resetAt: now + ACCEPT_WINDOW_MS });
    return true;
  }
  if (entry.count >= ACCEPT_LIMIT) return false;
  entry.count += 1;
  return true;
}
