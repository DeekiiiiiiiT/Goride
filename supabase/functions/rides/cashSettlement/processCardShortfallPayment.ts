import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCardShortfallJournalLines } from "./buildCardShortfallJournal.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { isCashSettlementSwitchToCardEnabled } from "./flags.ts";
import { getRiderArrearsMinor } from "./arrearsCheck.ts";

export interface CardShortfallPaymentParams {
  rideId: string;
  riderUserId: string;
  driverUserId: string;
  shortfallMinor: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface CardShortfallPaymentResult {
  success: boolean;
  error?: string;
  status?: number;
  amountPaidMinor?: number;
  newArrearsMinor?: number;
}

/**
 * Process a card payment for a ride shortfall (demo mode).
 * 
 * In demo mode, this doesn't actually charge a card - it simply:
 * 1. Validates the shortfall amount matches the ride state
 * 2. Posts a journal entry to clear the rider's arrears
 * 3. Updates the ride's shortfall_payment_method to 'card'
 * 
 * When real payment processing is added, step 1 would include the actual card charge.
 */
export async function processCardShortfallPayment(
  db: SupabaseClient,
  patchRide: (id: string, patch: Record<string, unknown>) => Promise<boolean>,
  loadRide: (id: string) => Promise<Record<string, unknown> | null>,
  params: CardShortfallPaymentParams,
): Promise<CardShortfallPaymentResult> {
  if (!isCashSettlementSwitchToCardEnabled()) {
    return { success: false, error: "feature_disabled", status: 404 };
  }

  const ride = await loadRide(params.rideId);
  if (!ride) {
    return { success: false, error: "not_found", status: 404 };
  }

  if (String(ride.rider_user_id) !== params.riderUserId) {
    return { success: false, error: "forbidden", status: 403 };
  }

  const status = String(ride.status ?? "");
  const outcome = String(ride.cash_settlement_outcome ?? "");

  const validStatuses = ["completed", "awaiting_cash_settlement"];
  const validOutcomes = ["underpay", "split", "unpaid"];

  if (!validStatuses.includes(status)) {
    return { success: false, error: "invalid_status", status: 409 };
  }

  if (!validOutcomes.includes(outcome) && status !== "awaiting_cash_settlement") {
    return { success: false, error: "no_shortfall", status: 400 };
  }

  const currentArrearsMinor = await getRiderArrearsMinor(db, params.riderUserId, params.currency);
  
  if (currentArrearsMinor <= 0) {
    return { success: false, error: "no_arrears", status: 400 };
  }

  const shortfallMinor = Math.min(params.shortfallMinor, currentArrearsMinor);

  if (shortfallMinor <= 0) {
    return { success: false, error: "invalid_amount", status: 400 };
  }

  const journalLines = buildCardShortfallJournalLines({
    rideId: params.rideId,
    riderUserId: params.riderUserId,
    driverUserId: params.driverUserId,
    shortfallMinor,
    currency: params.currency,
    paymentMethodId: params.paymentMethodId,
  });

  if (journalLines.length === 0) {
    return { success: false, error: "no_journal_lines", status: 500 };
  }

  const journalResult = await postPaymentJournal(db, {
    rideId: params.rideId,
    idempotencyKey: params.idempotencyKey,
    requestHash: `card_shortfall:${shortfallMinor}:${params.paymentMethodId}`,
    currency: params.currency,
    lines: journalLines,
    createdByUserId: params.riderUserId,
  });

  if (journalResult.conflict) {
    return { success: false, error: "idempotency_conflict", status: 409 };
  }

  if (journalResult.skipped && !journalResult.inserted) {
    const newArrears = await getRiderArrearsMinor(db, params.riderUserId, params.currency);
    return {
      success: true,
      amountPaidMinor: shortfallMinor,
      newArrearsMinor: newArrears,
    };
  }

  await patchRide(params.rideId, {
    shortfall_payment_method: "card",
  });

  const newArrearsMinor = await getRiderArrearsMinor(db, params.riderUserId, params.currency);

  console.info("[cashSettlement] card_shortfall_payment_completed", {
    ride_id: params.rideId,
    rider_user_id: params.riderUserId,
    amount_paid_minor: shortfallMinor,
    payment_method_id: params.paymentMethodId,
    new_arrears_minor: newArrearsMinor,
  });

  return {
    success: true,
    amountPaidMinor: shortfallMinor,
    newArrearsMinor,
  };
}
