import type { Claim, FinancialTransaction, Trip } from '../types/data';
import { normalizePlatform } from './normalizePlatform';

/** Trip platform for a resolved claim row (matched trip, else unlinked refund trip). */
export function getClaimPlatformDisplay(
  claim: Claim,
  toll: FinancialTransaction | null | undefined,
  tripById: ReadonlyMap<string, Trip>,
): { tollPlatform?: string; refundPlatform?: string; platform?: string } {
  const matchedTrip =
    (claim.tripId ? tripById.get(claim.tripId) : undefined) ||
    (toll?.tripId ? tripById.get(toll.tripId) : undefined) ||
    (toll?.matchedTripId ? tripById.get(toll.matchedTripId) : undefined);
  const unlinkedTrip = claim.unlinkedTripId ? tripById.get(claim.unlinkedTripId) : undefined;

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
    claim.platform;
  return single ? { platform: normalizePlatform(single) } : {};
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
