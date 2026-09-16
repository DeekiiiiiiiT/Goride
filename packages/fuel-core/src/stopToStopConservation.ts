/**
 * Stop-to-stop conservation controls — blocking close gates + UI banners.
 * Ship every control with an input that makes it fail (fuel recon audit lesson).
 */
import type { OdometerBucket } from './fuelTypes.ts';

export const STOP_TO_STOP_VOLUME_TOLERANCE_PCT = 0.01;
export const STOP_TO_STOP_DISTANCE_TOLERANCE_KM = 0.5;
export const STOP_TO_STOP_ATTRIBUTION_TOLERANCE_KM = 0.5;
/** GPS vs odometer band: max(3%, 5 km). */
export const STOP_TO_STOP_GPS_TOLERANCE_PCT = 0.03;
export const STOP_TO_STOP_GPS_TOLERANCE_KM = 5;

export type StopToStopConservationResult = {
  volumeOk: boolean;
  distanceOk: boolean;
  attributionOk: boolean;
  chainOk: boolean;
  volumeDeltaLiters: number;
  distanceDeltaKm: number;
  weekOpsLiters: number;
  bucketLiters: number;
  weekDistanceKm: number;
  bucketDistanceKm: number;
  messages: string[];
};

export function sumBucketLiters(buckets: OdometerBucket[]): number {
  return buckets.reduce((s, b) => s + (b.actualFuelLiters || 0), 0);
}

export function sumBucketDistanceKm(buckets: OdometerBucket[]): number {
  return buckets.reduce((s, b) => s + Math.max(0, b.endOdometer - b.startOdometer), 0);
}

/**
 * Independent distance reference for conservation: first→last boundary span.
 * Differs from sumBucketDistanceKm when a window is dropped/skipped (R-2).
 */
export function chainSpanKm(buckets: OdometerBucket[]): number {
  if (!buckets.length) return 0;
  const sorted = [...buckets].sort((a, b) => a.startOdometer - b.startOdometer);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return Math.max(0, last.endOdometer - first.startOdometer);
}

export function gpsVsOdoWithinTolerance(
  gpsKm: number,
  odoKm: number,
): boolean {
  const band = Math.max(STOP_TO_STOP_GPS_TOLERANCE_KM, Math.abs(odoKm) * STOP_TO_STOP_GPS_TOLERANCE_PCT);
  return Math.abs(gpsKm - odoKm) <= band;
}

export function evaluateStopToStopConservation(input: {
  buckets: OdometerBucket[];
  weekOpsLiters: number;
  /** Independent first→last fill odo span. Prefer chainSpanKm(buckets); never pass sum. */
  chainDistanceKm?: number;
}): StopToStopConservationResult {
  const bucketLiters = sumBucketLiters(input.buckets);
  const bucketDistanceKm = sumBucketDistanceKm(input.buckets);
  const weekOpsLiters = Math.max(0, input.weekOpsLiters || 0);
  const volumeDeltaLiters = bucketLiters - weekOpsLiters;
  const volumeDenom = Math.max(weekOpsLiters, 1e-6);
  const volumeOk =
    weekOpsLiters <= 0
      ? bucketLiters <= 0.01
      : Math.abs(volumeDeltaLiters) / volumeDenom <= STOP_TO_STOP_VOLUME_TOLERANCE_PCT;

  const chainDistanceKm =
    input.chainDistanceKm != null
      ? input.chainDistanceKm
      : chainSpanKm(input.buckets);
  const distanceDeltaKm = bucketDistanceKm - chainDistanceKm;
  const distanceOk = Math.abs(distanceDeltaKm) <= STOP_TO_STOP_DISTANCE_TOLERANCE_KM;

  let attributionOk = true;
  for (const b of input.buckets) {
    const dist = Math.max(0, b.endOdometer - b.startOdometer);
    const sum =
      (b.rideShareDistance || 0) +
      (b.companyMiscDistance || 0) +
      (b.personalDistance || 0) +
      (b.unexplainedDistance ?? 0);
    // R-5: same GPS band as over-log — not a 0.5 km hard tolerance.
    const band = Math.max(STOP_TO_STOP_GPS_TOLERANCE_KM, dist * STOP_TO_STOP_GPS_TOLERANCE_PCT);
    if (Math.abs(sum - dist) > band) {
      attributionOk = false;
      break;
    }
  }

  const chainOk = !input.buckets.some((b) => b.chainAnomaly || b.confidenceTier === 'indeterminate');

  const messages: string[] = [];
  if (!volumeOk) {
    messages.push(
      `Volume not reconciled: buckets ${bucketLiters.toFixed(1)} L vs week ops ${weekOpsLiters.toFixed(1)} L (Δ ${volumeDeltaLiters.toFixed(1)} L). Do not use for decisions.`,
    );
  }
  if (!distanceOk) {
    messages.push(
      `Distance not reconciled: buckets ${bucketDistanceKm.toFixed(1)} km vs chain ${chainDistanceKm.toFixed(1)} km.`,
    );
  }
  if (!attributionOk) {
    messages.push('Attribution does not close (RS + company + personal + unexplained ≠ bucket km).');
  }
  if (!chainOk) {
    messages.push('Odometer chain has anomalies or indeterminate rows.');
  }

  return {
    volumeOk,
    distanceOk,
    attributionOk,
    chainOk,
    volumeDeltaLiters,
    distanceDeltaKm,
    weekOpsLiters,
    bucketLiters,
    weekDistanceKm: chainDistanceKm,
    bucketDistanceKm,
    messages,
  };
}

export function stopToStopIsReconciled(result: StopToStopConservationResult): boolean {
  return result.volumeOk && result.distanceOk && result.attributionOk && result.chainOk;
}

/** Map conservation result → closable input flags (server + client). */
export function stopToStopClosableFlagsFromConservation(
  result: StopToStopConservationResult,
  extras?: { tripsTruncated?: boolean },
): {
  stopToStopVolumeFailed: boolean;
  stopToStopDistanceFailed: boolean;
  stopToStopAttributionFailed: boolean;
  stopToStopChainFailed: boolean;
  stopToStopTripsTruncated: boolean;
} {
  return {
    stopToStopVolumeFailed: !result.volumeOk,
    stopToStopDistanceFailed: !result.distanceOk,
    stopToStopAttributionFailed: !result.attributionOk,
    stopToStopChainFailed: !result.chainOk,
    stopToStopTripsTruncated: Boolean(extras?.tripsTruncated),
  };
}

/** Group key for per-vehicle conservation — missing id keeps legacy snapshots evaluable. */
const UNKNOWN_VEHICLE_KEY = '__unknown__';

function groupBucketsByVehicleId(buckets: OdometerBucket[]): Map<string, OdometerBucket[]> {
  const byVehicle = new Map<string, OdometerBucket[]>();
  for (const b of buckets) {
    const key = b.vehicleId && String(b.vehicleId).trim() ? String(b.vehicleId) : UNKNOWN_VEHICLE_KEY;
    const list = byVehicle.get(key);
    if (list) list.push(b);
    else byVehicle.set(key, [b]);
  }
  return byVehicle;
}

/**
 * Aggregate buckets from finalize snapshots and evaluate conservation.
 * Volume is fleet-wide (all buckets vs weekOpsLiters). Distance / attribution / chain
 * are evaluated per vehicleId so multi-vehicle weeks do not invent a cross-odo span (N-1).
 */
export function evaluateStopToStopFromSnapshots(input: {
  snapshots: Array<{ odometerBuckets?: OdometerBucket[]; totalGasCardCost?: number }>;
  weekOpsLiters: number;
}): ReturnType<typeof stopToStopClosableFlagsFromConservation> & {
  conservation: StopToStopConservationResult;
} {
  const buckets = input.snapshots.flatMap((s) =>
    Array.isArray(s.odometerBuckets) ? s.odometerBuckets : [],
  );

  // Volume control stays global — weekOpsLiters is the fleet week total.
  const volumeOnly = evaluateStopToStopConservation({
    buckets,
    weekOpsLiters: input.weekOpsLiters,
    // Distance unused for volumeOk; pass 0 so pooled chainSpan cannot poison messages.
    chainDistanceKm: sumBucketDistanceKm(buckets),
  });

  const byVehicle = groupBucketsByVehicleId(buckets);
  let distanceOk = true;
  let attributionOk = true;
  let chainOk = true;
  let bucketDistanceKm = 0;
  let weekDistanceKm = 0;
  const messages: string[] = [...volumeOnly.messages.filter((m) => m.startsWith('Volume'))];

  for (const [vehicleId, vBuckets] of byVehicle) {
    const per = evaluateStopToStopConservation({
      buckets: vBuckets,
      // Per-vehicle volume not authoritative — match litres so volumeOk stays true here.
      weekOpsLiters: sumBucketLiters(vBuckets),
      chainDistanceKm: chainSpanKm(vBuckets),
    });
    bucketDistanceKm += per.bucketDistanceKm;
    weekDistanceKm += per.weekDistanceKm;
    if (!per.distanceOk) {
      distanceOk = false;
      const label = vehicleId === UNKNOWN_VEHICLE_KEY ? 'unknown vehicle' : vehicleId;
      messages.push(
        `Distance not reconciled (${label}): buckets ${per.bucketDistanceKm.toFixed(1)} km vs chain ${per.weekDistanceKm.toFixed(1)} km.`,
      );
    }
    if (!per.attributionOk) {
      attributionOk = false;
      const label = vehicleId === UNKNOWN_VEHICLE_KEY ? 'unknown vehicle' : vehicleId;
      messages.push(`Attribution does not close (${label}).`);
    }
    if (!per.chainOk) {
      chainOk = false;
      const label = vehicleId === UNKNOWN_VEHICLE_KEY ? 'unknown vehicle' : vehicleId;
      messages.push(`Odometer chain has anomalies or indeterminate rows (${label}).`);
    }
  }

  const conservation: StopToStopConservationResult = {
    volumeOk: volumeOnly.volumeOk,
    distanceOk,
    attributionOk,
    chainOk,
    volumeDeltaLiters: volumeOnly.volumeDeltaLiters,
    distanceDeltaKm: bucketDistanceKm - weekDistanceKm,
    weekOpsLiters: volumeOnly.weekOpsLiters,
    bucketLiters: volumeOnly.bucketLiters,
    weekDistanceKm,
    bucketDistanceKm,
    messages,
  };

  return {
    conservation,
    ...stopToStopClosableFlagsFromConservation(conservation),
  };
}
