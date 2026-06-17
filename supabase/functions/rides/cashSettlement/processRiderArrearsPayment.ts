import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCardShortfallJournalLines } from "./buildCardShortfallJournal.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { isCashSettlementSwitchToCardEnabled } from "./flags.ts";
import { getRiderArrearsMinor } from "./arrearsCheck.ts";
import { resolveArrearsPaymentMethod } from "./arrearsPaymentMethods.ts";

export type ArrearsPaymentSourceKind = "wallet" | "trip_shortfall";

export interface ProcessRiderArrearsPaymentParams {
  riderUserId: string;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
  source: ArrearsPaymentSourceKind;
  rideId?: string;
  driverUserId?: string;
}

export interface ProcessRiderArrearsPaymentResult {
  success: boolean;
  error?: string;
  status?: number;
  amountPaidMinor?: number;
  newArrearsMinor?: number;
  paymentSource?: "demo_card" | "demo_lynk";
}

function scopedIdempotencyKey(
  source: ArrearsPaymentSourceKind,
  riderUserId: string,
  key: string,
): string {
  if (source === "wallet") {
    return `wallet_pay_arrears:${riderUserId}:${key}`;
  }
  return key;
}

/**
 * Pay full rider wallet arrears via demo card/Lynk (journal only).
 */
export async function processRiderArrearsPayment(
  db: SupabaseClient,
  params: ProcessRiderArrearsPaymentParams,
  options?: {
    patchRide?: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  },
): Promise<ProcessRiderArrearsPaymentResult> {
  if (!isCashSettlementSwitchToCardEnabled()) {
    return { success: false, error: "feature_disabled", status: 404 };
  }

  const method = resolveArrearsPaymentMethod(params.paymentMethodId);
  if (!method.valid || !method.paymentSource || !method.shortfallPaymentMethod) {
    return { success: false, error: "invalid_payment_method", status: 400 };
  }

  const currentArrearsMinor = await getRiderArrearsMinor(
    db,
    params.riderUserId,
    params.currency,
  );

  if (currentArrearsMinor <= 0) {
    return { success: false, error: "no_arrears", status: 400 };
  }

  const amountMinor = currentArrearsMinor;
  const journalRideId = params.source === "wallet" ? null : (params.rideId ?? null);

  const journalLines = buildCardShortfallJournalLines({
    rideId: journalRideId,
    riderUserId: params.riderUserId,
    driverUserId: params.driverUserId ?? "",
    shortfallMinor: amountMinor,
    currency: params.currency,
    paymentMethodId: params.paymentMethodId,
    paymentSource: method.paymentSource,
    arrearsPaymentSource: params.source,
  });

  if (journalLines.length === 0) {
    return { success: false, error: "no_journal_lines", status: 500 };
  }

  const idempotencyKey = scopedIdempotencyKey(
    params.source,
    params.riderUserId,
    params.idempotencyKey,
  );

  const journalResult = await postPaymentJournal(db, {
    rideId: journalRideId,
    idempotencyKey,
    requestHash: `arrears_pay:${amountMinor}:${params.paymentMethodId}:${params.source}`,
    currency: params.currency,
    lines: journalLines,
    createdByUserId: params.riderUserId,
  });

  if (journalResult.conflict) {
    return { success: false, error: "idempotency_conflict", status: 409 };
  }

  const newArrearsMinor = await getRiderArrearsMinor(
    db,
    params.riderUserId,
    params.currency,
  );

  if (
    params.source === "trip_shortfall" &&
    params.rideId &&
    options?.patchRide &&
    (journalResult.inserted > 0 || (journalResult.skipped && !journalResult.conflict))
  ) {
    await options.patchRide(params.rideId, {
      shortfall_payment_method: method.shortfallPaymentMethod,
    });
  }

  if (journalResult.inserted > 0) {
    console.info("[cashSettlement] rider_arrears_payment_completed", {
      rider_user_id: params.riderUserId,
      amount_paid_minor: amountMinor,
      payment_method_id: params.paymentMethodId,
      payment_source: method.paymentSource,
      source: params.source,
      ride_id: params.rideId ?? null,
      new_arrears_minor: newArrearsMinor,
    });
  }

  return {
    success: true,
    amountPaidMinor: amountMinor,
    newArrearsMinor,
    paymentSource: method.paymentSource,
  };
}
