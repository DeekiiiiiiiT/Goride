import type { TollV2Blocker, TollV2Charge, TollV2Desk, TollV2KeptPayback, TollV2Payback } from './types';

export const SECTION_ORDER = [
  {
    key: 'suggested',
    title: 'Suggested matches',
    id: 'toll-v2-section-suggested',
    explanation: 'The toll happened during an Uber trip, and Uber paid it back.',
    emptyCopy: 'Nothing to confirm',
  },
  {
    key: 'pick',
    title: 'Pick the right trip',
    id: 'toll-v2-section-pick',
    explanation: 'Two trips fit this toll. Choose the one it belongs to.',
    emptyCopy: 'Nothing to pick',
  },
  {
    key: 'no_trip',
    title: 'Tolls with no trip',
    id: 'toll-v2-section-no-trip',
    explanation: 'No Uber trip at this time. Who pays?',
    emptyCopy: 'Nothing to decide',
  },
  {
    key: 'receipts',
    title: 'Cash receipts to check',
    id: 'toll-v2-section-receipts',
    explanation: "The driver paid cash and sent a photo. It doesn't count until it's checked.",
    emptyCopy: 'Nothing to check',
  },
  {
    key: 'duplicates',
    title: 'Possible duplicates',
    id: 'toll-v2-section-duplicates',
    explanation: 'Two toll charges may be the same crossing.',
    emptyCopy: 'Nothing to review',
  },
  {
    key: 'paybacks',
    title: 'Uber paybacks with no toll',
    id: 'toll-v2-section-paybacks',
    explanation: 'Uber paid back an amount with no matching toll yet.',
    emptyCopy: 'Nothing to review',
  },
  {
    key: 'decided',
    title: 'Decided',
    id: 'toll-v2-section-decided',
    explanation: 'Tolls you already confirmed this week.',
    emptyCopy: 'Nothing decided yet',
  },
] as const;

export function sectionRowCount(
  charges: TollV2Charge[],
  key: string,
  paybacks: TollV2Payback[],
  kept: TollV2KeptPayback[],
): number {
  if (key === 'paybacks') return paybacks.length + kept.length;
  return chargesInSection(charges, key).length;
}

export function sectionTotalMinor(charges: TollV2Charge[], key: string): number {
  const rows = chargesInSection(charges, key);
  if (key === 'decided') {
    return rows.reduce((n, c) => n + (c.amountMinor ?? 0), 0);
  }
  return rows.reduce((n, c) => n + (c.openMinor ?? c.amountMinor ?? 0), 0);
}

/** The count chip's noun follows what the section holds (P3-R4 check: receipts said "0 tolls"). */
export function tollCountLabel(n: number, sectionKey?: string): string {
  const noun = sectionKey === 'receipts' ? 'receipt' : sectionKey === 'paybacks' ? 'payback' : 'toll';
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function chargesInSection(charges: TollV2Charge[], key: string): TollV2Charge[] {
  if (key === 'no_trip') {
    return charges.filter((c) => c.section === 'no_trip' || c.section === 'awaiting_cash');
  }
  if (key === 'decided') {
    return charges.filter((c) => c.section === 'decided');
  }
  return charges.filter((c) => c.section === key);
}

export function sureSuggestions(
  charges: TollV2Charge[],
): Array<{ charge: TollV2Charge; suggestion: NonNullable<TollV2Charge['suggestions']>[0] }> {
  const out: Array<{ charge: TollV2Charge; suggestion: NonNullable<TollV2Charge['suggestions']>[0] }> = [];
  for (const c of charges) {
    if (c.section !== 'suggested' || c.confidence !== 'sure') continue;
    const top = c.suggestions?.find((s) => s.top !== false) ?? c.suggestions?.[0];
    if (top) out.push({ charge: c, suggestion: top });
  }
  return out;
}

export type BlockerGroup = { label: string; count: number; sectionId: string };

export function blockerGroups(blockers: TollV2Blocker[]): BlockerGroup[] {
  // seal_blockers sends an unchecked cash receipt as kind 'charge' with reason (its state) 'unverified'.
  const isReceipt = (b: TollV2Blocker) => b.kind === 'charge' && b.reason === 'unverified';
  const charge = blockers.filter((b) => b.kind === 'charge' && !isReceipt(b)).length;
  const receipt = blockers.filter(isReceipt).length;
  const payback = blockers.filter((b) => b.kind === 'payback' || b.kind === 'carried').length;
  const review = blockers.filter((b) => b.kind === 'review_pair').length;
  const groups: BlockerGroup[] = [];
  if (charge > 0) {
    groups.push({
      label: `${charge} toll${charge === 1 ? '' : 's'} to decide`,
      count: charge,
      sectionId: 'toll-v2-section-suggested',
    });
  }
  const receiptN = receipt;
  if (receiptN > 0) {
    groups.push({
      label: `${receiptN} receipt${receiptN === 1 ? '' : 's'} to check`,
      count: receiptN,
      sectionId: 'toll-v2-section-receipts',
    });
  }
  const pb = payback || blockers.filter((b) => b.kind === 'payback').length;
  if (pb > 0) {
    groups.push({
      label: `${pb} Uber payback${pb === 1 ? '' : 's'} to decide`,
      count: pb,
      sectionId: 'toll-v2-section-paybacks',
    });
  }
  if (review > 0) {
    groups.push({
      label: `${review} possible duplicate${review === 1 ? '' : 's'}`,
      count: review,
      sectionId: 'toll-v2-section-duplicates',
    });
  }
  // Fallback: generic blockers from seal_blockers kinds
  if (groups.length === 0 && blockers.length > 0) {
    groups.push({
      label: `${blockers.length} item${blockers.length === 1 ? '' : 's'} to finish`,
      count: blockers.length,
      sectionId: 'toll-v2-section-suggested',
    });
  }
  return groups;
}

export function pairChargesForReview(desk: TollV2Desk, pair: { chargeA: string; chargeB: string }) {
  const a = desk.charges.find((c) => c.id === pair.chargeA);
  const b = desk.charges.find((c) => c.id === pair.chargeB);
  return { a, b };
}

export function paybacksWithNoToll(paybacks: TollV2Payback[]): TollV2Payback[] {
  return paybacks;
}
