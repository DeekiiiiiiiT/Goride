/**
 * Env-driven CORS origin allowlist (shared across edge functions).
 * Dev fallback: allow all when CORS_ALLOWED_ORIGINS is empty and ENVIRONMENT is unset/dev/local.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";

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

  const allowSet = new Set(allowed);

  return (origin: string): string | null => {
    if (!origin) return null;
    const lower = origin.toLowerCase();
    if (allowSet.has(lower)) return origin;
    for (const a of allowSet) {
      if (lower.endsWith(`.${a.replace(/^https?:\/\//, "")}`)) return origin;
      if (lower === a) return origin;
    }
    return null;
  };
}

const DEFAULT_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = [
  "Content-Type",
  "Authorization",
  "apikey",
  "x-client-info",
  "x-request-id",
];

/** Apply allowlisted CORS middleware to a Hono app. */
export function applyCors(
  app: Hono,
  opts?: {
    allowMethods?: string[];
    allowHeaders?: string[];
  },
): void {
  app.use(
    "*",
    cors({
      origin: buildCorsOriginFn(),
      allowMethods: opts?.allowMethods ?? DEFAULT_METHODS,
      allowHeaders: opts?.allowHeaders ?? DEFAULT_HEADERS,
    }),
  );
}
