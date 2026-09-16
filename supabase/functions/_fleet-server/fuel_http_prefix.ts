/**
 * HTTP path prefix for fuel Hono routes inside fuel_controller / fuel_period_routes.
 * Standalone fleet-fuel wraps with Hono `.basePath("/fleet-fuel")` in fleet-fuel/src/main.ts
 * because Supabase Edge passes the function slug in c.req.path (not stripped).
 * Legacy monolith used /make-server-37f42386/<route> under the same-named function.
 */
export const FUEL_HTTP_PREFIX = "";
