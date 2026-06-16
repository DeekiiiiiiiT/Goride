import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRiderArrearsMinor } from "./arrearsCheck.ts";
import { isCashSettlementSwitchToCardEnabled } from "./flags.ts";
import { processRiderArrearsPayment } from "./processRiderArrearsPayment.ts";

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
 * Validates ride state then delegates to shared wallet arrears processor.
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

  const result = await processRiderArrearsPayment(
    db,
    {
      riderUserId: params.riderUserId,
      currency: params.currency,
      paymentMethodId: params.paymentMethodId,
      idempotencyKey: params.idempotencyKey,
      source: "trip_shortfall",
      rideId: params.rideId,
      driverUserId: params.driverUserId,
    },
    { patchRide },
  );

  return result;
}
