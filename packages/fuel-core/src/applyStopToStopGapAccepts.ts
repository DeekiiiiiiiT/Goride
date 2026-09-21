/**
 * Apply audited OVER-LOG accepts to stop-to-stop closable flags.
 * Never clears chain failures — only attribution when every failing window is accepted.
 */
import type { OdometerBucket } from './fuelTypes.ts';
import { classifyStopToStopBucketRemediation } from './classifyStopToStopBucketRemediation.ts';
import {
  STOP_TO_STOP_GPS_TOLERANCE_KM,
  STOP_TO_STOP_GPS_TOLERANCE_PCT,
} from './stopToStopConservation.ts';

export type StopToStopGapAcceptDisposition =
  | 'trips_overstated'
  | 'gps_noise'
  | 'known_variance'
  | 'other';

export type StopToStopGapAccept = {
  bucketId?: string;
  vehicleId: string;
  startOdometer: number;
  endOdometer: number;
  startDate: string;
  endDate: string;
  note: string;
  disposition?: StopToStopGapAcceptDisposition | string;
  at?: string;
  by?: string | null;
};

export type StopToStopClosableFlagSet = {
  stopToStopVolumeFailed?: boolean;
  stopToStopDistanceFailed?: boolean;
  stopToStopAttributionFailed?: boolean;
  stopToStopChainFailed?: boolean;
  stopToStopTripsTruncated?: boolean;
};

export function stopToStopGapAcceptMatchKey(
  a: Pick<
    StopToStopGapAccept,
    'bucketId' | 'vehicleId' | 'startOdometer' | 'endOdometer' | 'endDate'
  >,
): string {
  const bid = String(a.bucketId || '').trim();
  if (bid) return `id:${bid}`;
  return `v:${String(a.vehicleId || '').trim()}|${Number(a.startOdometer) || 0}|${
    Number(a.endOdometer) || 0
  }|${String(a.endDate || '').slice(0, 10)}`;
}

export function bucketStopToStopGapAcceptMatchKey(
  b: Pick<OdometerBucket, 'id' | 'vehicleId' | 'startOdometer' | 'endOdometer' | 'endDate'>,
): string {
  return stopToStopGapAcceptMatchKey({
    bucketId: b.id,
    vehicleId: b.vehicleId,
    startOdometer: b.startOdometer,
    endOdometer: b.endOdometer,
    endDate: b.endDate,
  });
}

function bucketAttributionFails(
  b: Pick<
    OdometerBucket,
    | 'startOdometer'
    | 'endOdometer'
    | 'rideShareDistance'
    | 'companyMiscDistance'
    | 'personalDistance'
    | 'unexplainedDistance'
  >,
): boolean {
  const dist = Math.max(0, (b.endOdometer || 0) - (b.startOdometer || 0));
  const sum =
    (b.rideShareDistance || 0) +
    (b.companyMiscDistance || 0) +
    (b.personalDistance || 0) +
    (b.unexplainedDistance ?? 0);
  const band = Math.max(STOP_TO_STOP_GPS_TOLERANCE_KM, dist * STOP_TO_STOP_GPS_TOLERANCE_PCT);
  return Math.abs(sum - dist) > band;
}

export function isStopToStopGapAcceptable(
  bucket: Parameters<typeof classifyStopToStopBucketRemediation>[0],
): boolean {
  const kind = classifyStopToStopBucketRemediation(bucket).kind;
  return kind === 'trips' || kind === 'adjustments' || kind === 'mixed';
}

export function findStopToStopGapAccept(
  accepts: StopToStopGapAccept[] | null | undefined,
  bucket: Pick<OdometerBucket, 'id' | 'vehicleId' | 'startOdometer' | 'endOdometer' | 'endDate'>,
): StopToStopGapAccept | undefined {
  if (!accepts?.length) return undefined;
  const key = bucketStopToStopGapAcceptMatchKey(bucket);
  const byId = String(bucket.id || '').trim();
  return accepts.find((a) => {
    if (byId && String(a.bucketId || '').trim() === byId) return true;
    return stopToStopGapAcceptMatchKey(a) === key;
  });
}

/**
 * Attribution fails only while an unaccepted OVER-LOG window remains.
 * Chain / Indet. never count toward attribution here — they use stopToStopChainFailed only.
 * Volume / distance / truncated / chain flags are never cleared by accepts.
 */
export function applyStopToStopGapAccepts(
  flags: StopToStopClosableFlagSet,
  buckets: OdometerBucket[],
  accepts: StopToStopGapAccept[] | null | undefined,
): StopToStopClosableFlagSet {
  const next = { ...flags };
  if (!next.stopToStopAttributionFailed) return next;
  if (!buckets.length) return next;

  const stillFails = buckets.some((b) => {
    if (!isStopToStopGapAcceptable(b)) return false;
    if (!bucketAttributionFails(b)) return false;
    return !findStopToStopGapAccept(accepts, b);
  });

  next.stopToStopAttributionFailed = stillFails;
  return next;
}

export function upsertStopToStopGapAccepts(
  existing: StopToStopGapAccept[],
  incoming: StopToStopGapAccept[],
): StopToStopGapAccept[] {
  const map = new Map<string, StopToStopGapAccept>();
  for (const a of existing) {
    map.set(stopToStopGapAcceptMatchKey(a), a);
  }
  for (const a of incoming) {
    map.set(stopToStopGapAcceptMatchKey(a), a);
  }
  return Array.from(map.values());
}

export function revokeStopToStopGapAccept(
  existing: StopToStopGapAccept[],
  target: Pick<
    StopToStopGapAccept,
    'bucketId' | 'vehicleId' | 'startOdometer' | 'endOdometer' | 'endDate'
  >,
): StopToStopGapAccept[] {
  const key = stopToStopGapAcceptMatchKey(target);
  const bid = String(target.bucketId || '').trim();
  return existing.filter((a) => {
    if (bid && String(a.bucketId || '').trim() === bid) return false;
    return stopToStopGapAcceptMatchKey(a) !== key;
  });
}

/**
 * Shared request validation for stop-to-stop gap accept (client + server).
 */
export function validateStopToStopGapAcceptRequest(input: {
  note: string;
  accepts: Array<{
    kind?: string;
    remediationKind?: string;
    chainAnomaly?: boolean;
    confidenceTier?: string;
    rideShareDistance?: number;
    personalDistance?: number;
    companyMiscDistance?: number;
    unaccountedDistance?: number;
    startOdometer?: number;
    endOdometer?: number;
  }>;
}): { ok: true } | { ok: false; error: string; minLength?: number } {
  const note = String(input.note || '').trim();
  if (note.length < 8) {
    return { ok: false, error: 'note_too_short', minLength: 8 };
  }
  if (!Array.isArray(input.accepts) || input.accepts.length === 0) {
    return { ok: false, error: 'accepts_required' };
  }
  for (const raw of input.accepts) {
    const kindHint = String(raw?.kind || raw?.remediationKind || '').trim();
    if (kindHint === 'chain') {
      return { ok: false, error: 'chain_cannot_accept' };
    }
    if (raw?.chainAnomaly === true || String(raw?.confidenceTier || '') === 'indeterminate') {
      return { ok: false, error: 'chain_cannot_accept' };
    }
    if (raw && (raw.rideShareDistance != null || raw.unaccountedDistance != null)) {
      const rem = classifyStopToStopBucketRemediation({
        startOdometer: Number(raw.startOdometer) || 0,
        endOdometer: Number(raw.endOdometer) || 0,
        rideShareDistance: Number(raw.rideShareDistance) || 0,
        personalDistance: Number(raw.personalDistance) || 0,
        companyMiscDistance: Number(raw.companyMiscDistance) || 0,
        unaccountedDistance: Number(raw.unaccountedDistance) || 0,
        chainAnomaly: Boolean(raw.chainAnomaly),
        confidenceTier: raw.confidenceTier as OdometerBucket['confidenceTier'],
      });
      if (rem.kind === 'chain') {
        return { ok: false, error: 'chain_cannot_accept' };
      }
    }
  }
  return { ok: true };
}
