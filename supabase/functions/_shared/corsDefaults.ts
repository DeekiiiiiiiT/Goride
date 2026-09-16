/**
 * Shared CORS method/header defaults — Hono-free so npm and deno.land helpers stay in sync.
 * Union of monolith (make-server) + historical shared defaults — do not swap one for the other.
 */
export const CORS_DEFAULT_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export const CORS_DEFAULT_HEADERS = [
  "Content-Type",
  "Authorization",
  "apikey",
  "x-client-info",
  "x-request-id",
  "X-Roam-Product-Line",
  "X-Roam-Settings-Segment",
] as const;

export const CORS_EXPOSE_HEADERS = [
  "Content-Length",
  "X-Cache",
  "X-Total-Count",
  "X-Request-Id",
] as const;

export const CORS_MAX_AGE = 600;
