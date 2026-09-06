/**
 * Pure operational rate helpers for Driver Detail / Service Quality.
 * Extracted from DriverDetail metrics useMemo — keep side-effect free for tests.
 */

export type ServiceQualityTripCounts = {
  completed: number;
  cancelled: number;
};

export type ServiceQualityRates = {
  totalTrips: number;
  completionRate: number;
  cancellationRate: number;
  /** Whole-number percent 0–100, or null when no trips and no CSV. */
  acceptanceRate: number | null;
};

/**
 * Normalize CSV acceptance (fraction 0–1 or percent 0–100) to whole percent.
 */
export function normalizeAcceptancePercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 1) return Math.round(raw * 100);
  return Math.round(raw);
}

/**
 * Completion / cancellation / acceptance rates for a period.
 * Acceptance prefers CSV when provided; otherwise mirrors completion rate.
 */
export function computeServiceQualityRates(
  counts: ServiceQualityTripCounts,
  csvAcceptanceRate?: number | null,
): ServiceQualityRates {
  const completed = Math.max(0, Number(counts.completed) || 0);
  const cancelled = Math.max(0, Number(counts.cancelled) || 0);
  const totalTrips = completed + cancelled;
  const completionRate = totalTrips > 0 ? (completed / totalTrips) * 100 : 0;
  const cancellationRate = totalTrips > 0 ? (cancelled / totalTrips) * 100 : 0;

  const fromCsv = normalizeAcceptancePercent(csvAcceptanceRate);
  let acceptanceRate: number | null = fromCsv;
  if (acceptanceRate == null && totalTrips > 0) {
    acceptanceRate = Math.round(completionRate);
  }

  return { totalTrips, completionRate, cancellationRate, acceptanceRate };
}
