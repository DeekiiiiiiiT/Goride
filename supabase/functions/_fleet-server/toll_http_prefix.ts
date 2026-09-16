/**
 * HTTP path prefix for toll Hono routes (toll_controller / toll_period_controller).
 * Standalone fleet-toll wraps with Hono `.basePath("/fleet-toll")` (ADR-0020).
 * Empty prefix matches fuel's FUEL_HTTP_PREFIX cutover.
 */
export const TOLL_HTTP_PREFIX = "";
