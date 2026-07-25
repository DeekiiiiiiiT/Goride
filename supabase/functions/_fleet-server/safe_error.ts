/**
 * Safe error response helper for money/admin APIs (Wave 6).
 * 
 * Prevents raw Postgres/JS error messages from leaking to clients.
 * Returns a stable error shape and logs the real error server-side.
 */

import type { Context } from "npm:hono";

interface SafeErrorResponse {
  error: "internal_error";
  code: "INTERNAL";
  message: "Something went wrong";
}

/**
 * Returns a sanitized 500 response to the client while logging the real error.
 * Use in catch blocks for money/admin endpoints that previously returned e.message.
 */
export function safeErrorResponse(
  c: Context,
  e: unknown,
  logPrefix: string,
): Response {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(`[${logPrefix}] Internal error:`, err.message, err.stack);

  const body: SafeErrorResponse = {
    error: "internal_error",
    code: "INTERNAL",
    message: "Something went wrong",
  };

  return c.json(body, 500);
}
