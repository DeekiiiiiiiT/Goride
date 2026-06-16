import {
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
} from "./buildJournalEntries.ts";

export interface BuildCardShortfallJournalParams {
  rideId: string;
  riderUserId: string;
  driverUserId: string;
  shortfallMinor: number;
  currency: string;
  paymentMethodId: string;
  paymentSource?: "demo_card" | "demo_lynk";
  arrearsPaymentSource?: "wallet" | "trip_shortfall";
}

/**
 * Build journal lines for a card shortfall payment.
 *
 * This posts a single entry that credits the rider wallet (clears arrears).
 */
export function buildCardShortfallJournalLines(
  params: BuildCardShortfallJournalParams,
): JournalLineSpec[] {
  const {
    rideId,
    riderUserId,
    shortfallMinor,
    currency,
    paymentMethodId,
    paymentSource = "demo_card",
    arrearsPaymentSource,
  } = params;

  if (shortfallMinor <= 0) {
    return [];
  }

  const riderKey = riderAccountKeyForUser(riderUserId);
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    shortfall_minor: shortfallMinor,
    payment_method_id: paymentMethodId,
    payment_source: paymentSource,
    settlement_version: 2,
    ...(arrearsPaymentSource ? { arrears_payment_source: arrearsPaymentSource } : {}),
  };

  const lines: JournalLineSpec[] = [];

  lines.push({
    entry_type: "card_shortfall_payment" as const,
    debit_account_key: PLATFORM_CLEARING_KEY,
    credit_account_key: riderKey,
    amount_minor: shortfallMinor,
    metadata: {
      ...baseMeta,
      description: "Card payment clears rider arrears",
    },
  });

  return lines;
}
