/**
 * Wait time fee calculation utilities.
 * Handles grace period and per-minute billing for driver wait time at pickup.
 */

export interface WaitTimeCalcParams {
  /** ISO timestamp when the grace period started (pickup geofence entry). */
  graceStartedAt: string;
  tripStartedAt: string | null;
  graceMinutes: number;
  ratePerMinMinor: number;
  surgeMultiplier: number;
  nowMs?: number;
}

/** @deprecated Use graceStartedAt */
export type WaitTimeCalcParamsLegacy = WaitTimeCalcParams & { arrivedPickupAt: string };

const PICKUP_WAIT_STATUSES = new Set([
  "driver_en_route_pickup",
  "driver_arrived_pickup",
]);

export function getWaitTimeGraceAnchor(ride: Record<string, unknown>): string | null {
  const started = ride.wait_time_started_at;
  if (started != null && String(started).trim()) return String(started);
  const status = String(ride.status ?? "");
  if (PICKUP_WAIT_STATUSES.has(status) || status === "on_trip") {
    const arrived = ride.arrived_pickup_at;
    if (arrived != null && String(arrived).trim()) return String(arrived);
  }
  return null;
}

export function shouldExposePickupWaitTime(status: string | undefined): boolean {
  return Boolean(status && PICKUP_WAIT_STATUSES.has(status));
}

export interface WaitTimeInfoPayload {
  wait_time_charge_enabled: boolean;
  wait_time_grace_remaining_seconds: number;
  wait_time_grace_expired: boolean;
  wait_time_current_fee_minor: number;
  wait_time_billable_minutes: number;
  wait_time_rate_per_min_minor: number;
}

export function buildWaitTimeInfo(
  graceStartedAt: string,
  settings: {
    wait_time_charge_enabled: boolean;
    wait_time_grace_minutes: number;
    wait_time_rate_per_min_minor: number;
  },
  options?: { tripStartedAt?: string | null; surgeMultiplier?: number; nowMs?: number },
): WaitTimeInfoPayload {
  const nowMs = options?.nowMs ?? Date.now();
  const graceRemaining = getGraceRemainingSeconds(
    graceStartedAt,
    settings.wait_time_grace_minutes,
    nowMs,
  );
  const waitCalc = calculateWaitTimeFee({
    graceStartedAt,
    tripStartedAt: options?.tripStartedAt ?? null,
    graceMinutes: settings.wait_time_grace_minutes,
    ratePerMinMinor: settings.wait_time_rate_per_min_minor,
    surgeMultiplier: options?.surgeMultiplier ?? 1,
    nowMs,
  });
  return {
    wait_time_charge_enabled: settings.wait_time_charge_enabled,
    wait_time_grace_remaining_seconds: graceRemaining,
    wait_time_grace_expired: waitCalc.isGraceExpired,
    wait_time_current_fee_minor: settings.wait_time_charge_enabled ? waitCalc.feeMinor : 0,
    wait_time_billable_minutes: waitCalc.billableMinutes,
    wait_time_rate_per_min_minor: settings.wait_time_rate_per_min_minor,
  };
}

export interface WaitTimeCalcResult {
  feeMinor: number;
  billableMinutes: number;
  totalWaitMinutes: number;
  graceExpiredAt: string | null;
  isGraceExpired: boolean;
}

/**
 * Calculate the wait time fee based on grace start, trip start time, and settings.
 * Fee is calculated as: (totalWaitMinutes - graceMinutes) * ratePerMinMinor * surgeMultiplier
 */
export function calculateWaitTimeFee(
  params: WaitTimeCalcParams | (WaitTimeCalcParams & { arrivedPickupAt?: string }),
): WaitTimeCalcResult {
  const nowMs = params.nowMs ?? Date.now();
  const graceStartedAt =
    "graceStartedAt" in params && params.graceStartedAt
      ? params.graceStartedAt
      : (params as { arrivedPickupAt?: string }).arrivedPickupAt ?? "";
  const arrivedMs = Date.parse(graceStartedAt);
  
  if (!Number.isFinite(arrivedMs)) {
    return {
      feeMinor: 0,
      billableMinutes: 0,
      totalWaitMinutes: 0,
      graceExpiredAt: null,
      isGraceExpired: false,
    };
  }
  
  const endMs = params.tripStartedAt ? Date.parse(params.tripStartedAt) : nowMs;
  const totalWaitMs = Math.max(0, endMs - arrivedMs);
  const totalWaitMinutes = totalWaitMs / 60_000;
  
  const graceMs = params.graceMinutes * 60_000;
  const graceExpiredAt = new Date(arrivedMs + graceMs).toISOString();
  const isGraceExpired = totalWaitMs > graceMs;
  
  const billableMs = Math.max(0, totalWaitMs - graceMs);
  const billableMinutes = billableMs / 60_000;
  
  if (billableMinutes <= 0 || params.ratePerMinMinor <= 0) {
    return {
      feeMinor: 0,
      billableMinutes: 0,
      totalWaitMinutes,
      graceExpiredAt,
      isGraceExpired,
    };
  }
  
  const surge = Math.max(1, params.surgeMultiplier);
  const baseFee = billableMinutes * params.ratePerMinMinor;
  const feeMinor = Math.round(baseFee * surge);
  
  return {
    feeMinor,
    billableMinutes: Math.round(billableMinutes * 100) / 100,
    totalWaitMinutes: Math.round(totalWaitMinutes * 100) / 100,
    graceExpiredAt,
    isGraceExpired,
  };
}

/**
 * Check if the grace period has expired for a ride.
 */
export function isGracePeriodExpired(
  arrivedPickupAt: string,
  graceMinutes: number,
  nowMs = Date.now(),
): boolean {
  const arrivedMs = Date.parse(arrivedPickupAt);
  if (!Number.isFinite(arrivedMs)) return false;
  
  const graceMs = graceMinutes * 60_000;
  return nowMs - arrivedMs > graceMs;
}

/**
 * Get the remaining grace period in seconds.
 * Returns 0 if grace period has expired.
 */
export function getGraceRemainingSeconds(
  arrivedPickupAt: string,
  graceMinutes: number,
  nowMs = Date.now(),
): number {
  const arrivedMs = Date.parse(arrivedPickupAt);
  if (!Number.isFinite(arrivedMs)) return 0;
  
  const graceMs = graceMinutes * 60_000;
  const elapsedMs = nowMs - arrivedMs;
  const remainingMs = Math.max(0, graceMs - elapsedMs);
  
  return Math.round(remainingMs / 1000);
}

/**
 * Format wait time fee for display.
 */
export function formatWaitTimeFee(feeMinor: number, currency = "JMD"): string {
  if (feeMinor <= 0) return "";
  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency,
  }).format(feeMinor / 100);
}
