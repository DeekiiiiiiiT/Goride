import type { CashSettlementComputed } from "./computeOutcome.ts";

export const PLATFORM_RECEIVABLE_KEY = "platform:receivable";

export interface JournalLineSpec {
  entry_type: "cash_trip_arrears" | "cash_change_credit" | "cash_change_debit";
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

function userAccountKey(userId: string, role: "rider" | "driver"): string {
  return `user:${userId}:${role}`;
}

export function riderAccountKeyForUser(userId: string): string {
  return userAccountKey(userId, "rider");
}

export function driverAccountKeyForUser(userId: string): string {
  return userAccountKey(userId, "driver");
}

export function buildJournalLineSpecs(params: BuildJournalParams): JournalLineSpec[] {
  const { computed, riderAccountKey, driverAccountKey, rideId, currency } = params;
  const lines: JournalLineSpec[] = [];
  const baseMeta = {
    ride_request_id: rideId,
    currency,
    outcome: computed.outcome,
    owed_minor: computed.owed_minor,
    cash_received_minor: computed.cash_received_minor,
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
      entry_type: "cash_change_debit",
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
