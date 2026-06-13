import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  driverDigitalAccountKeyForUser,
  driverDebtAccountKeyForUser,
  type JournalLineSpec,
} from "./buildJournalEntries.ts";
import {
  getAccountByKey,
  postPaymentJournal,
  walletBalanceFromMinor,
} from "../../_shared/paymentAccounts.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";

export async function getDriverDigitalAvailableMinor(
  db: SupabaseClient | undefined,
  driverUserId: string,
  currency: string,
): Promise<number> {
  const legacyKey = `user:${driverUserId}:driver`;
  const digitalKey = driverDigitalAccountKeyForUser(driverUserId);

  let account = await getAccountByKey(db, digitalKey, currency);
  if (!account) {
    account = await getAccountByKey(db, legacyKey, currency);
  }
  if (!account) return 0;
  return walletBalanceFromMinor(account.balance_minor, currency).available_minor;
}

export async function getOpenDebtMinor(
  db: SupabaseClient | undefined,
  driverUserId: string,
  currency: string,
): Promise<number> {
  const { db: client, tables } = await getRidesPaymentDb();
  const obligationsTable = tables.obligations ?? "payment_obligations";
  const { data: openRows } = await client
    .from(obligationsTable)
    .select("remaining_minor")
    .eq("driver_user_id", driverUserId)
    .eq("currency", currency)
    .in("status", ["open", "partial"]);

  if (!openRows?.length) return 0;
  return openRows.reduce((sum, row) => sum + Math.max(0, Number(row.remaining_minor ?? 0)), 0);
}

export async function createPaymentObligation(
  db: SupabaseClient,
  opts: {
    driverUserId: string;
    rideRequestId: string;
    amountMinor: number;
    currency: string;
    obligationType?: "change_to_rider" | "arrears_recovery" | "other";
  },
): Promise<string | null> {
  const { db: client, tables } = await getRidesPaymentDb();
  const table = tables.obligations ?? "payment_obligations";
  const now = new Date().toISOString();

  if (opts.rideRequestId) {
    const { data: existing } = await client.from(table)
      .select("id")
      .eq("ride_request_id", opts.rideRequestId)
      .eq("obligation_type", opts.obligationType ?? "change_to_rider")
      .in("status", ["open", "partial", "closed"])
      .maybeSingle();
    if (existing?.id) return String(existing.id);
  }

  const { data, error } = await client.from(table).insert({
    driver_user_id: opts.driverUserId,
    ride_request_id: opts.rideRequestId,
    obligation_type: opts.obligationType ?? "change_to_rider",
    amount_minor: opts.amountMinor,
    remaining_minor: opts.amountMinor,
    currency: opts.currency,
    status: "open",
    created_at: now,
    updated_at: now,
  }).select("id").single();

  if (error || !data) {
    console.error("[debtRepayment] obligation insert failed:", error?.message);
    return null;
  }
  return String(data.id);
}

export async function applyPendingDebt(
  db: SupabaseClient | undefined,
  driverUserId: string,
  currency: string,
  trigger: string,
): Promise<{ repaidMinor: number; obligationsClosed: number }> {
  const { db: client, tables } = await getRidesPaymentDb();
  const obligationsTable = tables.obligations ?? "payment_obligations";

  const digitalAvailable = await getDriverDigitalAvailableMinor(db, driverUserId, currency);
  if (digitalAvailable <= 0) {
    return { repaidMinor: 0, obligationsClosed: 0 };
  }

  const { data: openRows } = await client
    .from(obligationsTable)
    .select("*")
    .eq("driver_user_id", driverUserId)
    .eq("currency", currency)
    .in("status", ["open", "partial"])
    .order("created_at", { ascending: true });

  if (!openRows?.length) {
    return { repaidMinor: 0, obligationsClosed: 0 };
  }

  let remainingDigital = digitalAvailable;
  let repaidMinor = 0;
  let obligationsClosed = 0;

  for (const row of openRows) {
    if (remainingDigital <= 0) break;
    const obligationId = String(row.id);
    const remaining = Number(row.remaining_minor ?? 0);
    if (remaining <= 0) continue;

    const pay = Math.min(remainingDigital, remaining);
    if (pay <= 0) continue;

    const digitalKey = driverDigitalAccountKeyForUser(driverUserId);
    const debtKey = driverDebtAccountKeyForUser(driverUserId);
    const idempotencyKey = `debt_repay:${obligationId}:${pay}`;

    const lines: JournalLineSpec[] = [{
      entry_type: "debt_repay_from_digital",
      debit_account_key: digitalKey,
      credit_account_key: debtKey,
      amount_minor: pay,
      metadata: {
        obligation_id: obligationId,
        trigger,
        settlement_version: 2,
      },
    }];

    const result = await postPaymentJournal(db, {
      rideId: String(row.ride_request_id ?? obligationId),
      idempotencyKey,
      requestHash: idempotencyKey,
      currency,
      lines,
      createdByUserId: driverUserId,
    });

    if (result.conflict || (result.skipped && result.inserted === 0)) {
      continue;
    }

    const newRemaining = remaining - pay;
    const now = new Date().toISOString();
    const newStatus = newRemaining <= 0 ? "closed" : "partial";

    await client.from(obligationsTable).update({
      remaining_minor: Math.max(0, newRemaining),
      status: newStatus,
      closed_at: newStatus === "closed" ? now : null,
      updated_at: now,
    }).eq("id", obligationId);

    remainingDigital -= pay;
    repaidMinor += pay;
    if (newStatus === "closed") obligationsClosed++;
    console.info("[debtRepayment] debt_auto_repaid", {
      driver_user_id: driverUserId,
      obligation_id: obligationId,
      repaid_minor: pay,
      trigger,
    });
  }

  return { repaidMinor, obligationsClosed };
}
