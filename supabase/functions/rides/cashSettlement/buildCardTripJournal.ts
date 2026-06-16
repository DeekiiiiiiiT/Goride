import {
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  type JournalLineSpec,
} from "./buildJournalEntries.ts";

export interface BuildCardTripJournalParams {
  rideId: string;
  currency: string;
  driverUserId: string;
  fareMinor: number;
}

export function buildCardTripJournalLines(
  params: BuildCardTripJournalParams,
): JournalLineSpec[] {
  const { rideId, currency, driverUserId, fareMinor } = params;
  const fare = Math.max(0, Math.floor(Number(fareMinor) || 0));
  if (fare <= 0) return [];

  const digitalKey = driverDigitalAccountKeyForUser(driverUserId);
  return [{
    entry_type: "card_trip_digital_credit",
    debit_account_key: PLATFORM_CLEARING_KEY,
    credit_account_key: digitalKey,
    amount_minor: fare,
    metadata: {
      ride_request_id: rideId,
      currency,
      fare_minor: fare,
      settlement_version: 2,
      payment_method: "card",
    },
  }];
}
