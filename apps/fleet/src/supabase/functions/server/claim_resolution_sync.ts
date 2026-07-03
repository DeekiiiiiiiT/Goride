/**
 * Pure decision engine for the Claimable Loss → toll_ledger/driver-financials
 * sync. Answers ONE question given a claim's resolution transition: what
 * should happen to the driver's charge and to toll_ledger's resolution label?
 *
 * Background: Claimable Loss (underpaid tolls) historically only flipped a
 * claim's `status`/`resolutionReason` — it never touched `toll_ledger` or
 * created/reversed a driver charge. Worse, once a charge WAS wired in
 * (POST /claims auto-create), reclassifying a resolved claim (e.g.
 * Charge Driver -> Write Off, or flip-flopping) silently did nothing: the old
 * charge was never reversed, and re-flipping back to Charge Driver was a
 * silent no-op (the `!claim.resolutionTransactionId` guard blocked it forever
 * once set).
 *
 * This module is the single source of truth for "given the previous resolved
 * reason and the new one, what changes": reverse an active charge, apply a
 * new one, both, or neither — plus what toll_ledger.resolution should become.
 * Pure + dependency-free so it is unit-testable (Deno) independent of the
 * imperative KV/ledger side effects in driver_toll_charge.ts / index.tsx.
 *
 * Only reached when the driverTollChargeSyncEnabled flag is ON (see
 * toll_controller.tsx getRefundAutomationSettings /
 * driver_toll_charge.ts isDriverTollChargeSyncEnabled).
 */

export type ClaimResolutionReason = 'Charge Driver' | 'Write Off' | 'Reimbursed' | 'Other' | undefined;

export type TollLedgerResolution = 'personal' | 'business' | 'write_off' | 'refunded' | null;

/**
 * Maps a claim's resolutionReason to the durable toll_ledger.resolution enum.
 * 'Other' and undefined map to null — an unrecognized/absent reason carries
 * no financial meaning and should not be persisted as a resolution label.
 */
export function mapResolutionReasonToTollResolution(
  reason: ClaimResolutionReason,
): TollLedgerResolution {
  switch (reason) {
    case 'Charge Driver':
      return 'personal';
    case 'Write Off':
      return 'write_off';
    case 'Reimbursed':
      return 'refunded';
    default:
      return null;
  }
}

export interface ClaimResolutionSyncInput {
  /**
   * The claim's PRIOR applied outcome — undefined if the claim was not
   * previously in a Resolved state (i.e. no outcome has ever been applied).
   */
  prevReason: ClaimResolutionReason;
  /**
   * The claim's NEW outcome — undefined if the claim is not (or no longer)
   * in a Resolved state (e.g. reverted to Rejected/Sent_to_Driver).
   */
  nextReason: ClaimResolutionReason;
}

export interface ClaimResolutionSyncDecision {
  /** True when a previously-active driver charge must be reversed. */
  shouldReverse: boolean;
  /** True when a new driver charge must be applied. */
  shouldCharge: boolean;
  /** What toll_ledger.resolution should be set to. Null clears it. */
  nextLedgerResolution: TollLedgerResolution;
  /** True when prevReason === nextReason — nothing changed, fully idempotent no-op. */
  isNoop: boolean;
}

/**
 * Decide what must happen to the driver charge + toll_ledger label given a
 * resolution transition. Only ONE of shouldReverse/shouldCharge can be about
 * the SAME toll's charge state at a time in this model: a charge is reversed
 * when leaving 'Charge Driver', and applied when entering it. A direct
 * 'Charge Driver' -> 'Charge Driver' resave (no real change) is a no-op —
 * repeated saves of the same outcome must never double-charge or re-reverse.
 */
export function decideClaimResolutionSync(
  input: ClaimResolutionSyncInput,
): ClaimResolutionSyncDecision {
  const { prevReason, nextReason } = input;

  if (prevReason === nextReason) {
    return {
      shouldReverse: false,
      shouldCharge: false,
      nextLedgerResolution: mapResolutionReasonToTollResolution(nextReason),
      isNoop: true,
    };
  }

  const wasCharged = prevReason === 'Charge Driver';
  const isNowCharged = nextReason === 'Charge Driver';

  return {
    shouldReverse: wasCharged,
    shouldCharge: isNowCharged,
    nextLedgerResolution: mapResolutionReasonToTollResolution(nextReason),
    isNoop: false,
  };
}
