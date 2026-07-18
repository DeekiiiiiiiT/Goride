/**
 * Environment boot validation — Wave 5 fail-fast.
 *
 * Call `assertRequiredEnv()` once at startup (or first request) to surface
 * missing secrets immediately rather than failing silently mid-request.
 */

const REQUIRED_SECRETS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
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
