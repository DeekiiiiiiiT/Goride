/**
 * Resolve the server key for local scripts. Works under both Node and Deno.
 *
 * Order: SUPABASE_SECRET_KEYS (JSON, .default), then SUPABASE_SECRET_KEY, then the legacy
 * SUPABASE_SERVICE_ROLE_KEY. The new key is what the rotation plan moves everything onto; the
 * legacy one stays as a fallback so a script that runs before the local .env is updated keeps
 * working instead of failing with a confusing auth error.
 */
function env(name) {
  if (typeof Deno !== "undefined" && Deno?.env?.get) return Deno.env.get(name) || "";
  if (typeof process !== "undefined" && process?.env) return process.env[name] || "";
  return "";
}

export function serverKey() {
  const json = env("SUPABASE_SECRET_KEYS").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.default === "string" && parsed.default.trim()) return parsed.default.trim();
        const values = Object.values(parsed).filter((v) => typeof v === "string" && v.trim());
        if (values.length === 1) return values[0].trim();
      }
    } catch {
      // not JSON — fall through to the single-key names
    }
  }
  const single = env("SUPABASE_SECRET_KEY").trim();
  if (single) return single;
  // Phase 8 revoked the legacy keys, so there is nothing to fall back to.
  return "";
}

/** Throws with a clear message when no server key is configured. */
export function requireServerKey() {
  const key = serverKey();
  if (!key) {
    throw new Error(
      "No server key configured (set SUPABASE_SECRET_KEYS or SUPABASE_SECRET_KEY in the environment, or in the app's .env.local)",
    );
  }
  return key;
}
