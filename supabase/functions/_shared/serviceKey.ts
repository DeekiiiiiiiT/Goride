/**
 * Server-only Supabase key for Edge Functions.
 * Plan: docs/supabase-key-rotation-plan.md — phase 2 ("one shared helper").
 *
 * Order:
 *  1. SUPABASE_SECRET_KEYS — JSON object of secret API keys, e.g. {"default":"sb_secret_…"}.
 *     `.default` wins; if only one key is present that one is used.
 *  2. (retired) the legacy `SUPABASE_SERVICE_ROLE_KEY` — phase 8 revoked those keys, so there is
 *     no fallback any more: a missing `SUPABASE_SECRET_KEYS` yields "" and `requireServiceKey()`
 *     throws instead of silently using a dead key.
 *
 * The value is a master key: never log it, never return it to a client, never put it in a
 * response body or error message.
 */

type SecretKeyMap = Record<string, unknown>;

function secretKeysJson(): string {
  return (Deno.env.get("SUPABASE_SECRET_KEYS") || "").trim();
}

function parseSecretKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as SecretKeyMap | null;
    if (!parsed || typeof parsed !== "object") return [];
    return Object.values(parsed)
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  } catch {
    // Malformed JSON must not take a function down: fall back to the legacy env key.
    return [];
  }
}

/** The secret key this function should call PostgREST / Admin API with. "" when unset. */
export function serviceKey(): string {
  const raw = secretKeysJson();
  if (raw) {
    const keys = parseSecretKeys(raw);
    const def = (() => {
      try {
        const parsed = JSON.parse(raw) as SecretKeyMap | null;
        const v = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).default : "";
        return typeof v === "string" ? v.trim() : "";
      } catch {
        return "";
      }
    })();
    if (def) return def;
    if (keys.length === 1) return keys[0];
  }
  // Phase 8 disabled the legacy keys, so there is no fallback to read any more.
  return "";
}

/** Same as serviceKey() but throws instead of returning "". Use where a key is mandatory. */
export function requireServiceKey(): string {
  const key = serviceKey();
  if (!key) {
    throw new Error("No server key configured (set SUPABASE_SECRET_KEYS)");
  }
  return key;
}

/**
 * Current server-side secret keys, for constant-time comparison of an incoming header.
 * The legacy service_role JWT is gone (phase 8 revoked it), so this is secret keys only.
 */
export function serviceKeyCandidates(): string[] {
  const raw = secretKeysJson();
  return raw ? parseSecretKeys(raw) : [];
}

/**
 * Only the NEW-format secret keys (`SUPABASE_SECRET_KEYS`), never the legacy service_role JWT.
 *
 * Use this to authorise a caller. The legacy key was leaked, so accepting its value keeps the
 * leaked key working even after phase 8 deactivates it at the gateway. Callers must present a
 * secret key — or a cron secret, where the route also accepts one.
 */
export function secretKeyCandidates(): string[] {
  const raw = secretKeysJson();
  return raw ? parseSecretKeys(raw) : [];
}
