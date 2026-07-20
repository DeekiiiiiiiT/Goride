import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { normalizePlatform } from './normalizePlatform';

const TRIP_ID_IN_TEXT_RE = /(?:from\s+)?trip\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Trip id from claim fields or buried in subject/message text. */
export function extractClaimLinkedTripId(claim: Claim): string | undefined {
  if (claim.tripId) return claim.tripId;
  if (claim.unlinkedTripId) return claim.unlinkedTripId;
  const fromSubject = claim.subject?.match(TRIP_ID_IN_TEXT_RE)?.[1];
  if (fromSubject) return fromSubject;
  return claim.message?.match(TRIP_ID_IN_TEXT_RE)?.[1];
}

function resolveDisplayTrip(
  claim: Claim,
  toll: FinancialTransaction | null | undefined,
  tripById: ReadonlyMap<string, Trip>,
): Trip | undefined {
  const matchedTrip =
    (claim.tripId ? tripById.get(claim.tripId) : undefined) ||
    (toll?.tripId ? tripById.get(toll.tripId) : undefined) ||
    (toll?.matchedTripId ? tripById.get(toll.matchedTripId) : undefined);
  if (matchedTrip) return matchedTrip;

  const unlinkedTrip = claim.unlinkedTripId ? tripById.get(claim.unlinkedTripId) : undefined;
  if (unlinkedTrip) return unlinkedTrip;

  const buriedId = extractClaimLinkedTripId(claim);
  return buriedId ? tripById.get(buriedId) : undefined;
}

function tollPlazaLabel(toll: FinancialTransaction | null | undefined): string | undefined {
  if (!toll) return undefined;
  const meta = toll.metadata as { plaza?: string } | undefined;
  const plaza =
    (toll as { tollPlaza?: string }).tollPlaza ||
    meta?.plaza ||
    undefined;
  if (plaza && String(plaza).trim()) return String(plaza).trim();
  return undefined;
}

function isWeakTollLocation(value: string | undefined | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (!v) return true;
  // Highway company / generic receipt text — not a useful History location.
  if (v === 'passage receipt' || v === 'toll charge' || v === 'toll') return true;
  if (v.includes('transjamaica') || v.includes('transjama')) return true;
  if (v.includes('highways') && !v.includes(',')) return true;
  return false;
}

export type ClaimPlatformDisplay = {
  tollPlatform?: string;
  refundPlatform?: string;
  platform?: string;
};

/** Trip platform for a resolved claim row (matched trip, unlinked refund, dispute, or buried subject trip). */
export function getClaimPlatformDisplay(
  claim: Claim,
  toll: FinancialTransaction | null | undefined,
  tripById: ReadonlyMap<string, Trip>,
  opts?: { disputePlatform?: string | null },
): ClaimPlatformDisplay {
  const matchedTrip =
    (claim.tripId ? tripById.get(claim.tripId) : undefined) ||
    (toll?.tripId ? tripById.get(toll.tripId) : undefined) ||
    (toll?.matchedTripId ? tripById.get(toll.matchedTripId) : undefined);
  const unlinkedTrip = claim.unlinkedTripId ? tripById.get(claim.unlinkedTripId) : undefined;
  const buriedTripId = extractClaimLinkedTripId(claim);
  const buriedTrip = buriedTripId ? tripById.get(buriedTripId) : undefined;

  const tollPlatform =
    matchedTrip?.platform ||
    claim.platform ||
    ((toll?.metadata as { source?: string } | undefined)?.source === 'roam_geofence'
      ? 'Roam'
      : undefined);

  const refundPlatform =
    claim.unlinkedSourcePlatform ||
    toll?.unlinkedSourcePlatform ||
    unlinkedTrip?.platform ||
    buriedTrip?.platform ||
    opts?.disputePlatform ||
    undefined;

  if (tollPlatform && refundPlatform && normalizePlatform(tollPlatform) !== normalizePlatform(refundPlatform)) {
    return {
      tollPlatform: normalizePlatform(tollPlatform),
      refundPlatform: normalizePlatform(refundPlatform),
    };
  }

  const single =
    tollPlatform ||
    refundPlatform ||
    matchedTrip?.platform ||
    unlinkedTrip?.platform ||
    buriedTrip?.platform ||
    opts?.disputePlatform ||
    claim.platform;
  return single ? { platform: normalizePlatform(single) } : {};
}

/**
 * Human-readable location for History rows.
 * Prefer trip address / plaza — never the toll highway vendor name.
 */
export function getClaimLocationDisplay(
  claim: Claim,
  toll: FinancialTransaction | null | undefined,
  tripById: ReadonlyMap<string, Trip>,
): string {
  const trip = resolveDisplayTrip(claim, toll, tripById);
  const candidates = [
    claim.pickup,
    claim.dropoff,
    trip?.pickupLocation,
    trip?.dropoffLocation,
    tollPlazaLabel(toll),
    claim.subject?.startsWith('Toll Refund:')
      ? claim.subject.replace(/^Toll Refund:\s*/, '').trim()
      : '',
  ];

  for (const c of candidates) {
    if (c && !isWeakTollLocation(c)) return c;
  }

  // Last resort: toll description only if it isn't a generic/vendor label.
  const desc = toll?.description;
  if (desc && !isWeakTollLocation(desc)) return desc;

  return '';
}

/** Human label for which reconciliation bucket this claim came from. */
export function getClaimCategoryLabel(
  claim: Claim,
  toll?: FinancialTransaction | null,
): string {
  if (claim.disputeRefundId) return 'Dispute';

  const subject = (claim.subject || '').toLowerCase();
  const tollResolution = (toll?.metadata as { resolution?: string } | undefined)?.resolution;

  if (subject.includes('personal') || tollResolution === 'personal') return 'Personal';
  if (subject.includes('deadhead')) return 'Deadhead';
  if (
    subject.includes('business') ||
    claim.resolutionReason === 'Business Expense' ||
    tollResolution === 'business'
  ) {
    return 'Business';
  }
  if (claim.resolutionReason === 'Write Off' || tollResolution === 'write_off') return 'Write Off';

  if (claim.unlinkedTripId || toll?.unlinkedSourceTripId) return 'Underpaid';
  if (
    claim.type === 'Toll_Refund' ||
    subject.includes('underpaid') ||
    subject.includes('toll refund') ||
    subject.includes('shortfall')
  ) {
    return 'Underpaid';
  }

  const stage = toll?.workflowStage || '';
  if (stage.includes('deadhead')) return 'Deadhead';
  if (stage.includes('personal')) return 'Personal';
  if (stage.includes('underpaid') || stage === 'claim_filed' || stage === 'claim_resolved') {
    return 'Underpaid';
  }
  if (stage === 'matched') return 'Matched';

  return 'Other';
}

const CATEGORY_CHIP: Record<string, string> = {
  Personal: 'bg-purple-50 text-purple-700 border-purple-200',
  Deadhead: 'bg-blue-50 text-blue-700 border-blue-200',
  Underpaid: 'bg-amber-50 text-amber-800 border-amber-200',
  Dispute: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Business: 'bg-slate-50 text-slate-700 border-slate-200',
  'Write Off': 'bg-slate-100 text-slate-600 border-slate-200',
  Matched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Other: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function getClaimCategoryChipClass(category: string): string {
  return CATEGORY_CHIP[category] || CATEGORY_CHIP.Other;
}

/** Lookup dispute platform by claim.disputeRefundId. */
export function disputePlatformByClaimId(
  claim: Claim,
  disputeById: ReadonlyMap<string, Pick<DisputeRefund, 'platform'>> | undefined,
): string | undefined {
  if (!claim.disputeRefundId || !disputeById) return undefined;
  const platform = disputeById.get(claim.disputeRefundId)?.platform;
  return platform || undefined;
}
