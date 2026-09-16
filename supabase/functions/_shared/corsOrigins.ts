/**
 * CORS origin allowlist logic — no Hono import (safe for npm:hono and deno.land entrypoints).
 */
/** Native shell origins (Play / App Store Capacitor WebViews). */
export const CAPACITOR_WEBVIEW_ORIGINS = [
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
] as const;

/** Local Vite/Next ports (http://localhost:3000) — not the same string as http://localhost. */
function isLoopbackBrowserOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function buildCorsOriginFn(): (origin: string) => string | null {
  const rawEnv = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const envMode = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "").toLowerCase();
  const isDev = envMode === "development" || envMode === "local" || envMode === "";

  const allowed = rawEnv
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  // Dev fallback: allow all if no explicit list
  if (allowed.length === 0 && isDev) {
    return () => "*";
  }

  const viteUrl = Deno.env.get("VITE_APP_URL") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (viteUrl) allowed.push(viteUrl.toLowerCase());
  if (supabaseUrl) allowed.push(supabaseUrl.toLowerCase());

  for (const o of CAPACITOR_WEBVIEW_ORIGINS) {
    allowed.push(o);
  }

  // Expand www / non-www pairs for https/http origins (roamdriver.co ↔ www.roamdriver.co)
  const expanded: string[] = [];
  for (const a of allowed) {
    expanded.push(a);
    try {
      const u = new URL(a);
      if (u.hostname.startsWith("www.")) {
        expanded.push(
          `${u.protocol}//${u.hostname.slice(4)}${u.port ? `:${u.port}` : ""}`,
        );
      } else if (u.hostname.includes(".")) {
        expanded.push(
          `${u.protocol}//www.${u.hostname}${u.port ? `:${u.port}` : ""}`,
        );
      }
    } catch {
      // ignore malformed / non-URL entries (e.g. capacitor://localhost already pushed)
    }
  }

  const allowSet = new Set(expanded);

  return (origin: string): string | null => {
    if (!origin) return null;
    const lower = origin.toLowerCase();
    // Local app servers always allowed so localhost:3000 can talk to prod edge functions
    if (isLoopbackBrowserOrigin(lower)) return origin;
    if (allowSet.has(lower)) return origin;
    for (const a of allowSet) {
      if (lower.endsWith(`.${a.replace(/^https?:\/\//, "")}`)) return origin;
      if (lower === a) return origin;
    }
    return null;
  };
}
