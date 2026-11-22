/**
 * Minimum reason length to reset or reopen a fuel week (fuel audit F-32a).
 * Must match FUEL_REOPEN_REASON_MIN in supabase/functions/_fleet-server/fuel_reopen_guard.ts,
 * which is what actually refuses a short reason.
 */
export const FUEL_REOPEN_REASON_MIN = 10;
