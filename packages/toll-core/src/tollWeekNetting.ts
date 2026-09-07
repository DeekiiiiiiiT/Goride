/**
 * One-netting week rollup for Toll Reconciliation (Flawless Weekly Close C-3/C-4).
 *
 * `computeTollFleetLossNetting` answers ONE question: the fleet's Net Toll Loss
 * (floored at $0). The four reconciliation cards (Spend / Reimbursed / Charged
 * to Drivers / Net Toll Loss) need the broken-out pieces AND a signed net so the
 * screen can tell whether the cards actually reconcile. This is that single
 * source — every card and the identity residual come from the SAME event scan,
 * so they can never disagree with each other the way two engines did (see
 * RECONCILIATION_SYSTEM_AUDIT.md headline problem #2).
 */

import {
  isTollFleetLossEvent,
  isUberTollReimbursement,
  sumTollChargedToDriversFromEvents,
  tollEventAmount,
  type TollLedgerLikeEvent,
} from './tollFleetLossNetting.ts';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type TollWeekNetting = {
  /** Real plaza/tag fleet spend (non-trip toll_charge). */
  tagSpend: number;
  /** Trip charges that were cash-washed (offset present) — extra cash spend. */
  cashWashSpend: number;
  /** Unmatched Uber trip tolls = platform coverage (reimbursement, not spend). */
  platformReimbursed: number;
  /** Operator refunds + inflow offsets, net of reinstated outflow offsets. */
  disputeRecovered: number;
  /** Wallet recoveries from canonical toll_charged_to_driver events (H-9). */
  chargedToDrivers: number;
  /** SIGNED raw net: tagSpend + cashWashSpend − platformReimbursed − disputeRecovered. */
  netLoss: number;
  /**
   * Four-card identity residual:
   *   Spend − Reimbursed − ChargedToDrivers − NetTollLoss.
   * ≈ 0 only when wallet recoveries don't break the identity; otherwise this is
   * the exact unexplained gap the UI must NOT paper over.
   */
  residual: number;
  /** True when the fleet over-recovered (signed net < 0, displayed loss floors to $0). */
  clipped: boolean;
};

/**
 * Single-pass week netting from canonical events already scoped to one week.
 * Callers should pre-bucket by fleet-calendar week (tollEventDate) first.
 */
export function computeTollWeekNetting(
  eventsInWeek: TollLedgerLikeEvent[] | undefined | null,
): TollWeekNetting {
  const scoped = (eventsInWeek || []).filter(
    (e) => isTollFleetLossEvent(e) || String(e.eventType || '').startsWith('toll_charge'),
  );

  let tagSpend = 0;
  let refundsAndInflowOffsets = 0;
  let reinstated = 0;
  const offsetSourceIds = new Set<string>();
  const tripCharges: Array<{ sourceId: string; amt: number }> = [];

  for (const e of scoped) {
    if (String(e.eventType || '') !== 'toll_charge_offset') continue;
    if (String(e.direction || '') === 'inflow') offsetSourceIds.add(String(e.sourceId || ''));
  }

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = tollEventAmount(e);
    if (t === 'toll_charge' || t === 'toll_reimbursement') {
      if (isUberTollReimbursement(e)) tripCharges.push({ sourceId: String(e.sourceId || ''), amt });
      else if (t === 'toll_charge') tagSpend += amt;
    } else if (t === 'toll_refund') {
      refundsAndInflowOffsets += amt;
    } else if (t === 'toll_charge_offset') {
      const dir = String(e.direction || '');
      if (dir === 'inflow') refundsAndInflowOffsets += amt;
      else if (dir === 'outflow') reinstated += amt;
    }
  }

  let cashWashSpend = 0;
  let platformReimbursed = 0;
  for (const tc of tripCharges) {
    if (offsetSourceIds.has(tc.sourceId)) cashWashSpend += tc.amt;
    else platformReimbursed += tc.amt;
  }

  const disputeRecovered = refundsAndInflowOffsets - reinstated;
  const netLoss = tagSpend + cashWashSpend - platformReimbursed - disputeRecovered;
  const chargedToDrivers = sumTollChargedToDriversFromEvents(scoped);

  // Spend − Reimbursed − ChargedToDrivers − NetTollLoss. With netLoss defined as
  // Spend − Reimbursed, this equals −chargedToDrivers: the wallet-recovery gap
  // that stops the four cards reconciling to a clean P&L identity.
  const spend = tagSpend + cashWashSpend;
  const reimbursed = platformReimbursed + disputeRecovered;
  const residual = spend - reimbursed - chargedToDrivers - netLoss;

  return {
    tagSpend: round2(tagSpend),
    cashWashSpend: round2(cashWashSpend),
    platformReimbursed: round2(platformReimbursed),
    disputeRecovered: round2(disputeRecovered),
    chargedToDrivers: round2(chargedToDrivers),
    netLoss: round2(netLoss),
    residual: round2(residual),
    clipped: netLoss < -0.005,
  };
}

/** Tolerance (JMD cents) for declaring the four-card identity closed. */
export const TOLL_WEEK_IDENTITY_EPS = 0.01;

/** True when the week's four cards reconcile (no unexplained wallet-recovery gap). */
export function tollWeekIdentityCloses(
  netting: Pick<TollWeekNetting, 'residual'>,
  eps: number = TOLL_WEEK_IDENTITY_EPS,
): boolean {
  return Math.abs(netting.residual) <= eps;
}
