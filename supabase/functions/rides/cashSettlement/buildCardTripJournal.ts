import {
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
} from "./buildJournalEntries.ts";
import { orgDigitalAccountKey } from "../../_shared/fleetOrgPayout.ts";
import type { CardTripSettlementResult } from "./computeCardTripSettlement.ts";

export interface BuildCardTripJournalParams {
  rideId: string;
  currency: string;
  driverUserId: string;
  riderUserId: string;
  settlement: CardTripSettlementResult;
  /** Tips stay with the driver even when fare credits the fleet org. */
  tipMinor?: number;
  organizationId?: string | null;
  fleetOrgPayout?: boolean;
}

export function buildCardTripJournalLines(
  params: BuildCardTripJournalParams,
): JournalLineSpec[] {
  const {
    rideId,
    currency,
    driverUserId,
    riderUserId,
    settlement,
    tipMinor = 0,
    organizationId,
    fleetOrgPayout,
  } = params;
  const fare = settlement.fare_minor;
  if (fare <= 0 && tipMinor <= 0) return [];

  const walletPaid = settlement.wallet_paid_minor;
  const cardCharge = settlement.card_charge_minor;
  const useOrg = Boolean(fleetOrgPayout && organizationId);
  const fareCreditKey = useOrg
    ? orgDigitalAccountKey(String(organizationId))
    : driverDigitalAccountKeyForUser(driverUserId);
  const tipCreditKey = driverDigitalAccountKeyForUser(driverUserId);
  const riderKey = riderAccountKeyForUser(riderUserId);

  const baseMeta = {
    ride_request_id: rideId,
    currency,
    fare_minor: fare,
    wallet_paid_minor: walletPaid,
    card_charge_minor: cardCharge,
    tip_minor: tipMinor,
    settlement_version: 2,
    payment_method: "card",
    fleet_org_payout: useOrg,
    organization_id: useOrg ? organizationId : null,
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
      credit_account_key: fareCreditKey,
      amount_minor: walletPaid,
      metadata: {
        ...baseMeta,
        funded_from: "rider_wallet",
        payout_destination: useOrg ? "fleet_org" : "driver",
      },
    });
  }

  if (cardCharge > 0) {
    lines.push({
      entry_type: "card_trip_digital_credit",
      debit_account_key: PLATFORM_CLEARING_KEY,
      credit_account_key: fareCreditKey,
      amount_minor: cardCharge,
      metadata: {
        ...baseMeta,
        funded_from: "card",
        payout_destination: useOrg ? "fleet_org" : "driver",
      },
    });
  }

  // Tips always credit the driving partner's personal Digital wallet.
  const tip = Math.max(0, Math.floor(Number(tipMinor) || 0));
  if (tip > 0) {
    lines.push({
      entry_type: "card_trip_digital_credit",
      debit_account_key: PLATFORM_CLEARING_KEY,
      credit_account_key: tipCreditKey,
      amount_minor: tip,
      metadata: { ...baseMeta, funded_from: "tip", payout_destination: "driver" },
    });
  }

  return lines;
}
