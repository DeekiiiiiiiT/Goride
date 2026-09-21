/**
 * Suggest the primary in-wizard fix for a stop-to-stop bucket that fails close.
 * Pure — no accept-away; conservation remains the closable source of truth.
 */
import type { OdometerBucket } from './fuelTypes.ts';
import {
  STOP_TO_STOP_GPS_TOLERANCE_KM,
  STOP_TO_STOP_GPS_TOLERANCE_PCT,
} from './stopToStopConservation.ts';

export type StopToStopRemediationKind = 'ok' | 'chain' | 'trips' | 'adjustments' | 'mixed';

export type StopToStopBucketRemediation = {
  kind: StopToStopRemediationKind;
  /** Operator-facing one-liner. */
  reason: string;
  /** Suggested primary CTAs (subset of fix actions). */
  suggestedActions: Array<'fix_odo' | 'review_trips' | 'review_adjustments' | 'inspect_timeline'>;
  overLogKm: number;
  odoKm: number;
};

function gpsBandKm(odoKm: number): number {
  return Math.max(STOP_TO_STOP_GPS_TOLERANCE_KM, Math.abs(odoKm) * STOP_TO_STOP_GPS_TOLERANCE_PCT);
}

export function classifyStopToStopBucketRemediation(
  bucket: Pick<
    OdometerBucket,
    | 'startOdometer'
    | 'endOdometer'
    | 'rideShareDistance'
    | 'personalDistance'
    | 'companyMiscDistance'
    | 'unaccountedDistance'
    | 'chainAnomaly'
    | 'confidenceTier'
  >,
): StopToStopBucketRemediation {
  const odoKm = Math.max(0, (bucket.endOdometer || 0) - (bucket.startOdometer || 0));
  const overLogKm = Math.max(0, Number(bucket.unaccountedDistance) || 0);
  const band = gpsBandKm(odoKm);

  if (bucket.chainAnomaly || bucket.confidenceTier === 'indeterminate') {
    return {
      kind: 'chain',
      reason: 'Odometer readings between these fills look wrong or out of order — fix the start/end odometer.',
      suggestedActions: ['fix_odo', 'inspect_timeline'],
      overLogKm,
      odoKm,
    };
  }

  if (overLogKm <= band) {
    return {
      kind: 'ok',
      reason: 'This fill window closes within tolerance.',
      suggestedActions: [],
      overLogKm,
      odoKm,
    };
  }

  const rs = Math.max(0, Number(bucket.rideShareDistance) || 0);
  const personal = Math.max(0, Number(bucket.personalDistance) || 0);
  const company = Math.max(0, Number(bucket.companyMiscDistance) || 0);
  const adj = personal + company;

  if (rs >= adj && rs > 0) {
    return {
      kind: 'trips',
      reason: `Trip km exceed odometer movement by ${overLogKm.toLocaleString()} km — review trips in this window.`,
      suggestedActions: ['review_trips', 'fix_odo', 'inspect_timeline'],
      overLogKm,
      odoKm,
    };
  }

  if (adj > rs && adj > 0) {
    return {
      kind: 'adjustments',
      reason: `Personal/company km exceed odometer movement by ${overLogKm.toLocaleString()} km — review those adjustments.`,
      suggestedActions: ['review_adjustments', 'fix_odo', 'inspect_timeline'],
      overLogKm,
      odoKm,
    };
  }

  return {
    kind: 'mixed',
    reason: `Logged distance exceeds odometer by ${overLogKm.toLocaleString()} km — check trips, adjustments, and odometer.`,
    suggestedActions: ['review_trips', 'review_adjustments', 'fix_odo', 'inspect_timeline'],
    overLogKm,
    odoKm,
  };
}

/** Broken buckets first: chain anomalies, then largest over-log. */
export function sortBucketsForRemediation<T extends Parameters<typeof classifyStopToStopBucketRemediation>[0] & { id?: string }>(
  buckets: T[],
): T[] {
  return [...buckets].sort((a, b) => {
    const ca = classifyStopToStopBucketRemediation(a);
    const cb = classifyStopToStopBucketRemediation(b);
    const rank = (k: StopToStopRemediationKind) =>
      k === 'chain' ? 0 : k === 'ok' ? 9 : 1;
    const dr = rank(ca.kind) - rank(cb.kind);
    if (dr !== 0) return dr;
    return cb.overLogKm - ca.overLogKm;
  });
}

export function summarizeStopToStopRemediation<
  T extends Parameters<typeof classifyStopToStopBucketRemediation>[0] & {
    id?: string;
    vehicleId?: string;
    startOdometer?: number;
    endOdometer?: number;
    endDate?: string;
  },
>(
  buckets: T[],
  plateHint?: string,
  opts?: {
    /** When set, accepted OVER-LOG windows are excluded from the count. */
    isAccepted?: (b: T) => boolean;
    /** When true, copy is week-scoped (not “this vehicle”). */
    weekScope?: boolean;
  },
): string {
  const broken = buckets.filter((b) => {
    const kind = classifyStopToStopBucketRemediation(b).kind;
    if (kind === 'ok') return false;
    if (kind !== 'chain' && opts?.isAccepted?.(b)) return false;
    return true;
  });
  const scope = opts?.weekScope ? 'this week' : 'this vehicle';
  if (broken.length === 0) {
    return opts?.isAccepted
      ? `Stop-to-stop is clear for ${scope} (accepted or fixed).`
      : `Stop-to-stop is clear for ${scope}.`;
  }
  const where = plateHint ? ` on ${plateHint}` : '';
  const chainN = broken.filter((b) => classifyStopToStopBucketRemediation(b).kind === 'chain').length;
  if (chainN === broken.length) {
    return `${broken.length} fill window${broken.length === 1 ? '' : 's'}${where} need odometer fixes.`;
  }
  if (chainN > 0) {
    return `${broken.length} fill window${broken.length === 1 ? '' : 's'}${where} still block Finalize (${chainN} need odometer fixes).`;
  }
  return `${broken.length} fill window${broken.length === 1 ? '' : 's'}${where} have trip/adjustment km larger than the odometer moved.`;
}

export type StopToStopWeekBlockerInventory<T> = {
  chainWindows: T[];
  unacceptedOverLog: T[];
  blockingCount: number;
  /** Prefer chain, then unaccepted OVER-LOG. */
  focusBucket: T | null;
  weekSummary: string;
};

/** Week-scoped actionable inventory — same set as closable gate + Fix sheet. */
export function inventoryStopToStopWeekBlockers<
  T extends Parameters<typeof classifyStopToStopBucketRemediation>[0] & {
    id?: string;
    vehicleId?: string;
    startOdometer?: number;
    endOdometer?: number;
    endDate?: string;
  },
>(
  weekBuckets: T[],
  opts?: {
    isAccepted?: (b: T) => boolean;
  },
): StopToStopWeekBlockerInventory<T> {
  const chainWindows: T[] = [];
  const unacceptedOverLog: T[] = [];
  for (const b of weekBuckets) {
    const kind = classifyStopToStopBucketRemediation(b).kind;
    if (kind === 'ok') continue;
    if (kind === 'chain') {
      chainWindows.push(b);
      continue;
    }
    if (!opts?.isAccepted?.(b)) unacceptedOverLog.push(b);
  }
  const blockingCount = chainWindows.length + unacceptedOverLog.length;
  const focusBucket = chainWindows[0] || unacceptedOverLog[0] || null;
  return {
    chainWindows,
    unacceptedOverLog,
    blockingCount,
    focusBucket,
    weekSummary: summarizeStopToStopRemediation(weekBuckets, undefined, {
      isAccepted: opts?.isAccepted,
      weekScope: true,
    }),
  };
}
