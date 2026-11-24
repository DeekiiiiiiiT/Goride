/**
 * Environment boot validation — Wave 5 fail-fast.
 *
 * Call `assertRequiredEnv()` once at startup (or first request) to surface
 * missing secrets immediately rather than failing silently mid-request.
 */

const REQUIRED_SECRETS = ["SUPABASE_URL"] as const;
/**
 * A server key is required, but either form satisfies it: the rotated `SUPABASE_SECRET_KEYS`
 * (JSON, `.default`) or the legacy single `SUPABASE_SERVICE_ROLE_KEY`. Requiring the legacy name
 * would make every fleet function refuse to boot the day Supabase stops injecting it.
 */
const SERVER_KEY_SOURCES = ["SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const OPTIONAL_WARN_SECRETS = ["AUDIT_HMAC_SECRET"] as const;

let _validated = false;

/**
 * Throws if any required env var is missing.
 * Warns once for optional secrets that are missing.
 * Safe to call multiple times — only runs checks on first invocation.
 */
export function assertRequiredEnv(): void {
  if (_validated) return;
  _validated = true;

  const missing: string[] = [];
  for (const key of REQUIRED_SECRETS) {
    const val = Deno.env.get(key);
    if (!val || val.trim().length === 0) {
      missing.push(key);
    }
  }
  const hasServerKey = SERVER_KEY_SOURCES.some((key) => (Deno.env.get(key) || "").trim().length > 0);
  if (!hasServerKey) {
    missing.push("SUPABASE_SECRET_KEYS (or the legacy SUPABASE_SERVICE_ROLE_KEY)");
  }

  if (missing.length > 0) {
    const msg = `[EnvBoot] FATAL: Missing required environment variable(s): ${missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }

  for (const key of OPTIONAL_WARN_SECRETS) {
    const val = Deno.env.get(key);
    if (!val || val.trim().length === 0) {
      console.warn(`[EnvBoot] WARN: Optional secret "${key}" is not set — some features may be degraded`);
    }
  }

  console.log("[EnvBoot] Environment validation passed");
}
