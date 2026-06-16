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
}

/**
 * Build journal lines for a card shortfall payment.
 * 
 * This posts a single entry that:
 * - Credits platform:clearing (simulating card processor funding)
 * - Debits platform:receivable (clearing the rider's arrears)
 * 
 * The driver has already been credited via platform_fare_guarantee,
 * so we only need to clear the rider's arrears when they pay via card.
 */
export function buildCardShortfallJournalLines(
  params: BuildCardShortfallJournalParams,
): JournalLineSpec[] {
  const { rideId, riderUserId, driverUserId, shortfallMinor, currency, paymentMethodId } = params;

  if (shortfallMinor <= 0) {
    return [];
  }

  const riderKey = riderAccountKeyForUser(riderUserId);
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    shortfall_minor: shortfallMinor,
    payment_method_id: paymentMethodId,
    payment_source: "demo_card",
    settlement_version: 2,
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
