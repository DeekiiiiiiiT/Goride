import type { CashSettlementComputed } from "./computeOutcome.ts";
import {
  driverCashAccountKeyForUser,
  driverDebtAccountKeyForUser,
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
  type WalletDeltaPreview,
} from "./buildJournalEntries.ts";

export interface BuildSettlementJournalV2Params {
  computed: CashSettlementComputed;
  rideId: string;
  currency: string;
  riderUserId: string;
  driverUserId: string;
  /** Available balance on driver digital wallet before settlement (minor units, >= 0). */
  digitalAvailableMinor: number;
}

export interface BuildSettlementJournalV2Result {
  lines: JournalLineSpec[];
  walletDeltas: WalletDeltaPreview;
  debtOpenedMinor: number;
}

export function buildSettlementJournalV2(
  params: BuildSettlementJournalV2Params,
): BuildSettlementJournalV2Result {
  const {
    computed,
    rideId,
    currency,
    riderUserId,
    driverUserId,
    digitalAvailableMinor,
  } = params;

  const riderKey = riderAccountKeyForUser(riderUserId);
  const digitalKey = driverDigitalAccountKeyForUser(driverUserId);
  const cashKey = driverCashAccountKeyForUser(driverUserId);
  const debtKey = driverDebtAccountKeyForUser(driverUserId);

  const lines: JournalLineSpec[] = [];
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    outcome: computed.outcome,
    owed_minor: computed.owed_minor,
    cash_received_minor: computed.cash_received_minor,
    settlement_version: 2,
  };

  const walletDeltas: WalletDeltaPreview = {
    rider_credit_minor: 0,
    driver_cash_credit_minor: 0,
    driver_digital_debit_minor: 0,
    driver_debt_opened_minor: 0,
    fare_allocated_minor: 0,
  };

  let debtOpenedMinor = 0;

  if (computed.cash_received_minor > 0) {
    lines.push({
      entry_type: "cash_trip_collection",
      debit_account_key: PLATFORM_CLEARING_KEY,
      credit_account_key: cashKey,
      amount_minor: computed.cash_received_minor,
      metadata: { ...baseMeta },
    });
    walletDeltas.driver_cash_credit_minor = computed.cash_received_minor;
  }

  const fareToAllocate = Math.min(computed.cash_received_minor, computed.owed_minor);
  if (fareToAllocate > 0) {
    lines.push({
      entry_type: "fare_allocation_from_cash",
      debit_account_key: cashKey,
      credit_account_key: PLATFORM_RECEIVABLE_KEY,
      amount_minor: fareToAllocate,
      metadata: { ...baseMeta, fare_allocated_minor: fareToAllocate },
    });
    walletDeltas.fare_allocated_minor = fareToAllocate;
    walletDeltas.driver_cash_credit_minor -= fareToAllocate;
  }

  if (computed.arrears_minor > 0) {
    lines.push({
      entry_type: "cash_trip_arrears",
      debit_account_key: riderKey,
      credit_account_key: PLATFORM_RECEIVABLE_KEY,
      amount_minor: computed.arrears_minor,
      metadata: { ...baseMeta, arrears_minor: computed.arrears_minor },
    });
  }

  if (computed.change_credit_minor > 0) {
    const change = computed.change_credit_minor;
    walletDeltas.rider_credit_minor = change;

    const fromDigital = Math.min(Math.max(0, digitalAvailableMinor), change);
    const toDebt = change - fromDigital;

    if (fromDigital > 0) {
      lines.push({
        entry_type: "change_paid_from_digital",
        debit_account_key: digitalKey,
        credit_account_key: riderKey,
        amount_minor: fromDigital,
        metadata: { ...baseMeta, change_credit_minor: change, from_digital_minor: fromDigital },
      });
      walletDeltas.driver_digital_debit_minor = fromDigital;
    }

    if (toDebt > 0) {
      lines.push({
        entry_type: "change_debt_open",
        debit_account_key: debtKey,
        credit_account_key: riderKey,
        amount_minor: toDebt,
        metadata: { ...baseMeta, change_credit_minor: change, debt_opened_minor: toDebt },
      });
      walletDeltas.driver_debt_opened_minor = toDebt;
      debtOpenedMinor = toDebt;
    }
  }

  return { lines, walletDeltas, debtOpenedMinor };
}
