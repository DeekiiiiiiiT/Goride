import type { SplitSettlementResult } from "./computeSplitSettlement.ts";
import {
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
  type WalletDeltaPreview,
} from "./buildJournalEntries.ts";
import { buildSettlementJournalV2 } from "./buildSettlementJournalV2.ts";
import type { CashSettlementComputed } from "./computeOutcome.ts";

export interface BuildSplitPaymentJournalParams {
  split: SplitSettlementResult;
  rideId: string;
  currency: string;
  riderUserId: string;
  driverUserId: string;
  digitalAvailableMinor: number;
}

export interface BuildSplitPaymentJournalResult {
  lines: JournalLineSpec[];
  walletDeltas: WalletDeltaPreview;
  debtOpenedMinor: number;
}

/**
 * Split settlement journal: cash collection + wallet fare + driver digital credit.
 * Overpay still uses buildSettlementJournalV2 via caller.
 */
export function buildSplitPaymentJournalLines(
  params: BuildSplitPaymentJournalParams,
): BuildSplitPaymentJournalResult {
  const { split, rideId, currency, riderUserId, driverUserId, digitalAvailableMinor } = params;

  if (split.storedOutcome !== "split") {
    throw new Error("buildSplitPaymentJournalLines requires split outcome");
  }

  const computedForCash: CashSettlementComputed = {
    outcome: "underpay",
    owed_minor: split.owed_minor,
    cash_received_minor: split.cash_received_minor,
    arrears_minor: 0,
    change_credit_minor: 0,
  };

  const cashBase = buildSettlementJournalV2({
    computed: computedForCash,
    rideId,
    currency,
    riderUserId,
    driverUserId,
    digitalAvailableMinor,
  });

  const lines: JournalLineSpec[] = [...cashBase.lines];
  const walletDeltas: WalletDeltaPreview = {
    ...cashBase.walletDeltas,
    driver_digital_credit_minor: split.driver_digital_credit_minor,
    rider_wallet_debit_minor: split.wallet_paid_minor,
  };
  const debtOpenedMinor = cashBase.debtOpenedMinor;

  const riderKey = riderAccountKeyForUser(riderUserId);
  const digitalKey = driverDigitalAccountKeyForUser(driverUserId);
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    outcome: split.storedOutcome,
    owed_minor: split.owed_minor,
    cash_received_minor: split.cash_received_minor,
    settlement_version: 2,
    wallet_paid_minor: split.wallet_paid_minor,
    rider_arrears_minor: split.rider_arrears_minor,
    driver_digital_credit_minor: split.driver_digital_credit_minor,
    platform_guarantee_minor: split.platform_guarantee_minor,
  };

  if (split.wallet_paid_minor > 0) {
    lines.push({
      entry_type: "wallet_fare_from_rider",
      debit_account_key: riderKey,
      credit_account_key: PLATFORM_CLEARING_KEY,
      amount_minor: split.wallet_paid_minor,
      metadata: { ...baseMeta },
    });
  }

  if (split.driver_digital_credit_minor > 0) {
    const fromWallet = Math.min(split.wallet_paid_minor, split.driver_digital_credit_minor);
    if (fromWallet > 0) {
      lines.push({
        entry_type: "wallet_fare_to_driver",
        debit_account_key: PLATFORM_CLEARING_KEY,
        credit_account_key: digitalKey,
        amount_minor: fromWallet,
        metadata: { ...baseMeta, funded_from: "rider_wallet" },
      });
    }
    const guarantee = split.platform_guarantee_minor;
    if (guarantee > 0) {
      lines.push({
        entry_type: "platform_fare_guarantee",
        debit_account_key: PLATFORM_RECEIVABLE_KEY,
        credit_account_key: digitalKey,
        amount_minor: guarantee,
        metadata: { ...baseMeta, funded_from: "platform_guarantee" },
      });
    }
  }

  if (split.rider_arrears_minor > 0) {
    lines.push({
      entry_type: "cash_trip_arrears",
      debit_account_key: riderKey,
      credit_account_key: PLATFORM_RECEIVABLE_KEY,
      amount_minor: split.rider_arrears_minor,
      metadata: { ...baseMeta, arrears_minor: split.rider_arrears_minor },
    });
  }

  return { lines, walletDeltas, debtOpenedMinor };
}
