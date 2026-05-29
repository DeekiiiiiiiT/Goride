/**
 * Wait time fee calculation utilities.
 * Handles grace period and per-minute billing for driver wait time at pickup.
 */

export interface WaitTimeCalcParams {
  arrivedPickupAt: string;
  tripStartedAt: string | null;
  graceMinutes: number;
  ratePerMinMinor: number;
  surgeMultiplier: number;
  nowMs?: number;
}

export interface WaitTimeCalcResult {
  feeMinor: number;
  billableMinutes: number;
  totalWaitMinutes: number;
  graceExpiredAt: string | null;
  isGraceExpired: boolean;
}

/**
 * Calculate the wait time fee based on arrival time, trip start time, and settings.
 * Fee is calculated as: (totalWaitMinutes - graceMinutes) * ratePerMinMinor * surgeMultiplier
 */
export function calculateWaitTimeFee(params: WaitTimeCalcParams): WaitTimeCalcResult {
  const nowMs = params.nowMs ?? Date.now();
  const arrivedMs = Date.parse(params.arrivedPickupAt);
  
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
