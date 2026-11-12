/** B8 week result contract — source of truth for consumers of `toll_read.week_result`. */

export const TOLL_WEEK_RESULT_CONTRACT_VERSION = 1 as const;

export interface TollWeekResultV1 {
  contractVersion: 1;
  companyId: string;
  /** Monday, ADR 0007 */
  weekKey: string;
  state: 'open' | 'sealed';
  weekVersion: number;
  factsHash: string;
  engineVersion: string;
  spend: { tagMinor: number; cashMinor: number; totalMinor: number };
  bearers: { platformMinor: number; driverMinor: number; fleetMinor: number };
  /**
   * Rev 8 (G1.3): count and undecided amount of charges whose ONE state (B2) is
   * 'pending', in the counted week. Excludes unverified, awaiting_cash, rejected, duplicate
   */
  pending: { charges: number; amountMinor: number };
  /** Rev 8: in the counted week (Rev 9 wording); blocks the seal */
  unverified: { charges: number; amountMinor: number };
  /**
   * Rev 8: in the counted week (Rev 9 wording); Roam cash rides not yet settled; does not block;
   * decided provisionally at seal
   */
  awaitingCash: { charges: number; amountMinor: number };
  paybacks: {
    receivedMinor: number;
    allocatedMinor: number;
    /** Rev 7: pending + part-allocated leftovers NOT yet decided; must be 0 to seal */
    unallocatedMinor: number;
    /** decided "no toll"; final, not part of unallocatedMinor */
    leftUnlinkedMinor: number;
    /** reversals landing this week */
    takenBackMinor: number;
  };
  /**
   * Rev 7 (G2): counted in this week's totals; Rev 8: read straight from toll.carried_facts
   */
  carriedIn: Array<{
    kind:
      | 'charge'
      | 'payback'
      | 'take_back'
      | 'correction_up'
      | 'correction_down'
      | 'cash_recovered';
    id: string;
    fromWeekKey: string;
    amountMinor: number;
    bearer?: 'fleet' | 'driver';
  }>;
  tagAccount: {
    openingMinor: number;
    topUpsMinor: number;
    usageMinor: number;
    closingMinor: number;
  };
  drivers: Array<{
    driverId: string;
    /** receivable_driver: personal, charged deadhead, shortfalls */
    owesFleetMinor: number;
    /** payable_driver: verified cash tolls */
    fleetOwesMinor: number;
    /** recovered_in_driver_cash: already inside their passenger cash */
    recoveredInPassengerCashMinor: number;
    /** Total posted spend attributed to this driver for the week */
    spendMinor: number;
    /** Tag-paid portion of spendMinor */
    tagSpendMinor: number;
    /** Cash-paid portion of spendMinor */
    cashSpendMinor: number;
    /** Platform-borne allocation total (toll reimbursement in settlement) */
    platformMinor: number;
    /** Fleet-borne allocation total (net fleet toll loss on the driver line) */
    fleetMinor: number;
  }>;
  afterSeal: Array<{
    kind: 'charge' | 'payback' | 'reversal' | 'correction';
    id: string;
    amountMinor: number;
    arrivedAt: string;
    /** Rev 6: the week it affects; never in the totals */
    relatedWeekKey: string;
  }>;
  /** for Business Finance to tie (B5 hand-off) */
  ledgerMovements: { bankMinor: number };
}
