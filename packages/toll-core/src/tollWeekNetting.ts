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
  /**
   * Wallet recoveries from canonical toll_charged_to_driver events (H-9).
   * LOCKED (C-3/C-4): this IS a P&L recovery — money the fleet recoups from
   * drivers — so it reduces Net Toll Loss just like reimbursements/refunds.
   */
  chargedToDrivers: number;
  /**
   * SIGNED raw net toll loss:
   *   tagSpend + cashWashSpend − platformReimbursed − disputeRecovered − chargedToDrivers.
   * Negative when the fleet over-recovered.
   */
  netLoss: number;
  /**
   * Four-card identity residual:
   *   Spend − Reimbursed − ChargedToDrivers − NetTollLoss.
   * With chargedToDrivers folded into netLoss this closes to ≈ 0 by construction;
   * a non-zero residual means the event scan itself is inconsistent (must NOT be
   * papered over).
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
  const chargedToDrivers = sumTollChargedToDriversFromEvents(scoped);

  // C-3/C-4 (LOCKED): chargedToDrivers is a P&L recovery, so it reduces Net Toll
  // Loss alongside reimbursements and refunds.
  const netLoss =
    tagSpend + cashWashSpend - platformReimbursed - disputeRecovered - chargedToDrivers;

  // Spend − Reimbursed − ChargedToDrivers − NetTollLoss. With chargedToDrivers now
  // inside netLoss this closes to ≈ 0 by construction; any drift means the event
  // scan disagrees with itself and must surface, not be hidden.
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
