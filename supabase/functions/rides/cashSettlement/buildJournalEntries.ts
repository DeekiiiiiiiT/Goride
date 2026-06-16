import type { CashSettlementComputed } from "./computeOutcome.ts";

export const PLATFORM_RECEIVABLE_KEY = "platform:receivable";
export const PLATFORM_CLEARING_KEY = "platform:clearing";

export type JournalEntryType =
  | "cash_trip_arrears"
  | "cash_change_credit"
  | "cash_change_debit"
  | "cash_trip_collection"
  | "change_paid_from_digital"
  | "change_debt_open"
  | "debt_repay_from_digital"
  | "fare_allocation_from_cash"
  | "card_trip_digital_credit"
  | "wallet_fare_from_rider"
  | "wallet_fare_to_driver"
  | "platform_fare_guarantee"
  | "card_shortfall_payment"
  | "dispute_resolution_credit"
  | "admin_arrears_writeoff"
  | "admin_settlement_adjustment"
  | "admin_driver_credit"
  | "admin_driver_debit";

export interface JournalLineSpec {
  entry_type: JournalEntryType;
  debit_account_key: string;
  credit_account_key: string;
  amount_minor: number;
  metadata: Record<string, unknown>;
}

export interface BuildJournalParams {
  computed: CashSettlementComputed;
  riderAccountKey: string;
  driverAccountKey: string;
  rideId: string;
  currency: string;
}

export interface WalletDeltaPreview {
  rider_credit_minor: number;
  driver_cash_credit_minor: number;
  driver_digital_debit_minor: number;
  driver_debt_opened_minor: number;
  fare_allocated_minor: number;
  driver_digital_credit_minor?: number;
  rider_wallet_debit_minor?: number;
}

function userAccountKey(userId: string, role: "rider" | "driver"): string {
  return `user:${userId}:${role}`;
}

export function riderAccountKeyForUser(userId: string): string {
  return userAccountKey(userId, "rider");
}

/** Legacy single driver account (V1). */
export function driverAccountKeyForUser(userId: string): string {
  return userAccountKey(userId, "driver");
}

export function driverDigitalAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:digital`;
}

export function driverCashAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:cash`;
}

export function driverDebtAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:debt`;
}

/** V1 single-account journal builder — used when CASH_SETTLEMENT_V2 is off. Deprecated after V2 production soak. */
export function buildJournalLineSpecs(params: BuildJournalParams): JournalLineSpec[] {
  const { computed, riderAccountKey, driverAccountKey, rideId, currency } = params;
  const lines: JournalLineSpec[] = [];
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    outcome: computed.outcome,
    owed_minor: computed.owed_minor,
    cash_received_minor: computed.cash_received_minor,
    settlement_version: 1,
  };

  if (computed.arrears_minor > 0) {
    lines.push({
      entry_type: "cash_trip_arrears",
      debit_account_key: riderAccountKey,
      credit_account_key: PLATFORM_RECEIVABLE_KEY,
      amount_minor: computed.arrears_minor,
      metadata: { ...baseMeta, arrears_minor: computed.arrears_minor },
    });
  }

  if (computed.change_credit_minor > 0) {
    lines.push({
      entry_type: "cash_change_credit",
      debit_account_key: driverAccountKey,
      credit_account_key: riderAccountKey,
      amount_minor: computed.change_credit_minor,
      metadata: { ...baseMeta, change_credit_minor: computed.change_credit_minor },
    });
  }

  return lines;
}

export function assertJournalBalanced(lines: JournalLineSpec[]): void {
  const total = lines.reduce((sum, line) => sum + line.amount_minor, 0);
  const debits = total;
  const credits = total;
  if (debits !== credits) {
    throw new Error(`journal_imbalance: debits=${debits} credits=${credits}`);
  }
}
