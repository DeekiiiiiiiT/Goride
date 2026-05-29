/**
 * Matching TTL and timeout helpers (shared by reconcile).
 */
import type { DispatchSettings } from "./dispatchSettings.ts";

export function matchingStartedAtMs(ride: Record<string, unknown>): number {
  const raw = ride.created_at ?? ride.updated_at;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

export function isMatchingTimedOut(
  ride: Record<string, unknown>,
  settings: Pick<DispatchSettings, "max_matching_duration_minutes">,
  nowMs = Date.now(),
): boolean {
  const maxMin = settings.max_matching_duration_minutes;
  const ageMs = nowMs - matchingStartedAtMs(ride);
  return ageMs > maxMin * 60 * 1000;
}
