/**
 * Env-driven CORS origin allowlist (shared across edge functions).
 * Origin logic lives in corsOrigins.ts (no Hono) so npm:hono workers can reuse it.
 *
 * - applyCors     → deno.land/x Hono (identity, fleet-ops, delivery, …) — this file
 * - applyCorsNpm  → npm:hono@4.3.11 — see corsAllowlistNpm.ts (do not import from here into fleet-fuel)
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import {
  buildCorsOriginFn,
  CAPACITOR_WEBVIEW_ORIGINS,
} from "./corsOrigins.ts";
import {
  CORS_DEFAULT_HEADERS,
  CORS_DEFAULT_METHODS,
  CORS_EXPOSE_HEADERS,
  CORS_MAX_AGE,
} from "./corsDefaults.ts";

export {
  buildCorsOriginFn,
  CAPACITOR_WEBVIEW_ORIGINS,
  CORS_DEFAULT_HEADERS,
  CORS_DEFAULT_METHODS,
  CORS_EXPOSE_HEADERS,
  CORS_MAX_AGE,
};

/** Apply allowlisted CORS middleware to a deno.land/x Hono app. */
export function applyCors(
  app: Hono,
  opts?: {
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    maxAge?: number;
  },
): void {
  app.use(
    "*",
    cors({
      origin: buildCorsOriginFn(),
      allowMethods: opts?.allowMethods ?? [...CORS_DEFAULT_METHODS],
      allowHeaders: opts?.allowHeaders ?? [...CORS_DEFAULT_HEADERS],
      exposeHeaders: opts?.exposeHeaders ?? [...CORS_EXPOSE_HEADERS],
      maxAge: opts?.maxAge ?? CORS_MAX_AGE,
    }),
  );
}
