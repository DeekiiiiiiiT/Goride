/**
 * npm:hono@4.3.11 CORS helper — no deno.land imports (safe for fleet-fuel prebundle).
 */
import type { Hono } from "npm:hono@4.3.11";
import { cors } from "npm:hono@4.3.11/cors";
import { buildCorsOriginFn } from "./corsOrigins.ts";
import {
  CORS_DEFAULT_HEADERS,
  CORS_DEFAULT_METHODS,
  CORS_EXPOSE_HEADERS,
  CORS_MAX_AGE,
} from "./corsDefaults.ts";

export function applyCorsNpm(
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
