import type { Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";

/**
 * Log the full error server-side; return a generic JSON body to the client.
 * Avoids leaking stack traces / internal details in API responses.
 */
export function safeJsonError(c: Context, err: unknown, status = 500) {
  console.error(err);
  return c.json({ error: "Something went wrong" }, status);
}
