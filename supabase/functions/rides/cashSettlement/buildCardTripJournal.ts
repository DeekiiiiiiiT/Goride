import {
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
} from "./buildJournalEntries.ts";
import type { CardTripSettlementResult } from "./computeCardTripSettlement.ts";

export interface BuildCardTripJournalParams {
  rideId: string;
  currency: string;
  driverUserId: string;
  riderUserId: string;
  settlement: CardTripSettlementResult;
}

export function buildCardTripJournalLines(
  params: BuildCardTripJournalParams,
): JournalLineSpec[] {
  const { rideId, currency, driverUserId, riderUserId, settlement } = params;
  const fare = settlement.fare_minor;
  if (fare <= 0) return [];

  const walletPaid = settlement.wallet_paid_minor;
  const cardCharge = settlement.card_charge_minor;
  const digitalKey = driverDigitalAccountKeyForUser(driverUserId);
  const riderKey = riderAccountKeyForUser(riderUserId);

  const baseMeta = {
    ride_request_id: rideId,
    currency,
    fare_minor: fare,
    wallet_paid_minor: walletPaid,
    card_charge_minor: cardCharge,
    settlement_version: 2,
    payment_method: "card",
  };

  const lines: JournalLineSpec[] = [];

  if (walletPaid > 0) {
    lines.push({
      entry_type: "wallet_fare_from_rider",
      debit_account_key: riderKey,
      credit_account_key: PLATFORM_CLEARING_KEY,
      amount_minor: walletPaid,
      metadata: { ...baseMeta, funded_from: "rider_wallet" },
    });
    lines.push({
      entry_type: "wallet_fare_to_driver",
      debit_account_key: PLATFORM_CLEARING_KEY,
      credit_account_key: digitalKey,
      amount_minor: walletPaid,
      metadata: { ...baseMeta, funded_from: "rider_wallet" },
    });
  }

  if (cardCharge > 0) {
    lines.push({
      entry_type: "card_trip_digital_credit",
      debit_account_key: PLATFORM_CLEARING_KEY,
      credit_account_key: digitalKey,
      amount_minor: cardCharge,
      metadata: { ...baseMeta, funded_from: "card" },
    });
  }

  return lines;
}
