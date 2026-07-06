import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  driverAccountKeyForUser,
  driverCashAccountKeyForUser,
  driverDebtAccountKeyForUser,
  driverDigitalAccountKeyForUser,
  PLATFORM_CLEARING_KEY,
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
} from "../rides/cashSettlement/buildJournalEntries.ts";
import { getRidesPaymentDb } from "./ridesPaymentDb.ts";
import { dualWriteRidesJournalLine } from "./unifiedLedger/dualWriteRides.ts";

export interface PaymentAccountRow {
  id: string;
  user_id: string | null;
  role: string;
  account_key: string;
  currency: string;
  balance_minor: number;
}

export interface WalletBalanceView {
  currency: string;
  balance_minor: number;
  available_minor: number;
  arrears_minor: number;
  credit_minor: number;
}

export interface DriverWalletsView {
  currency: string;
  digital: WalletBalanceView;
  cash: WalletBalanceView;
  debt: WalletBalanceView;
}

async function paymentDb(): Promise<Awaited<ReturnType<typeof getRidesPaymentDb>>> {
  return getRidesPaymentDb();
}

export async function getAccountByKey(
  db: SupabaseClient | undefined,
  accountKey: string,
  currency: string,
): Promise<PaymentAccountRow | null> {
  const { db: client, tables } = await paymentDb();
  const { data, error } = await client
    .from(tables.accounts)
    .select("*")
    .eq("account_key", accountKey)
    .eq("currency", currency)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentAccountRow | null;
}

export async function ensurePaymentAccount(
  db: SupabaseClient | undefined,
  opts: {
    userId: string | null;
    role: "rider" | "driver" | "system";
    accountKey: string;
    currency: string;
  },
): Promise<PaymentAccountRow> {
  const existing = await getAccountByKey(db, opts.accountKey, opts.currency);
  if (existing) return existing;

  const { db: client, tables } = await paymentDb();
  const { data, error } = await client
    .from(tables.accounts)
    .insert({
      user_id: opts.userId,
      role: opts.role,
      account_key: opts.accountKey,
      currency: opts.currency,
      balance_minor: 0,
    })
    .select("*")
    .single();

  if (error) {
    if (String(error.code) === "23505") {
      const again = await getAccountByKey(db, opts.accountKey, opts.currency);
      if (again) return again;
    }
    throw new Error(error.message);
  }
  return data as PaymentAccountRow;
}

export async function ensureRiderAccount(
  db: SupabaseClient,
  userId: string,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId,
    role: "rider",
    accountKey: riderAccountKeyForUser(userId),
    currency,
  });
}

export async function ensureDriverAccount(
  db: SupabaseClient,
  userId: string,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId,
    role: "driver",
    accountKey: driverAccountKeyForUser(userId),
    currency,
  });
}

export async function ensureDriverDigitalAccount(
  db: SupabaseClient,
  userId: string,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId,
    role: "driver",
    accountKey: driverDigitalAccountKeyForUser(userId),
    currency,
  });
}

export async function ensureDriverCashAccount(
  db: SupabaseClient,
  userId: string,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId,
    role: "driver",
    accountKey: driverCashAccountKeyForUser(userId),
    currency,
  });
}

export async function ensureDriverDebtAccount(
  db: SupabaseClient,
  userId: string,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId,
    role: "driver",
    accountKey: driverDebtAccountKeyForUser(userId),
    currency,
  });
}

export async function ensureSystemReceivableAccount(
  db: SupabaseClient,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId: null,
    role: "system",
    accountKey: PLATFORM_RECEIVABLE_KEY,
    currency,
  });
}

export async function ensureSystemClearingAccount(
  db: SupabaseClient,
  currency: string,
): Promise<PaymentAccountRow> {
  return ensurePaymentAccount(db, {
    userId: null,
    role: "system",
    accountKey: PLATFORM_CLEARING_KEY,
    currency,
  });
}

/** Rider / legacy driver wallet view (positive balance = credit). */
export function walletBalanceFromMinor(balanceMinor: number, currency: string): WalletBalanceView {
  const balance = Number(balanceMinor) || 0;
  return {
    currency,
    balance_minor: balance,
    available_minor: Math.max(0, balance),
    arrears_minor: Math.max(0, -balance),
    credit_minor: Math.max(0, balance),
  };
}

/** Debt wallet: negative balance = amount owed by driver. */
export function debtWalletBalanceFromMinor(balanceMinor: number, currency: string): WalletBalanceView {
  const balance = Number(balanceMinor) || 0;
  const owed = Math.max(0, -balance);
  return {
    currency,
    balance_minor: balance,
    available_minor: 0,
    arrears_minor: owed,
    credit_minor: 0,
  };
}

export async function getWalletBalance(
  db: SupabaseClient | undefined,
  userId: string,
  role: "rider" | "driver",
  currency: string,
): Promise<WalletBalanceView> {
  const accountKey = role === "rider"
    ? riderAccountKeyForUser(userId)
    : driverAccountKeyForUser(userId);
  let account = await getAccountByKey(db, accountKey, currency);
  if (!account && role === "driver") {
    account = await getAccountByKey(db, driverDigitalAccountKeyForUser(userId), currency);
  }
  if (!account) {
    return walletBalanceFromMinor(0, currency);
  }
  return walletBalanceFromMinor(account.balance_minor, currency);
}

export async function getDriverWallets(
  db: SupabaseClient | undefined,
  userId: string,
  currency: string,
): Promise<DriverWalletsView> {
  const legacyDigital = await getAccountByKey(db, driverAccountKeyForUser(userId), currency);
  const digitalAcct = await getAccountByKey(db, driverDigitalAccountKeyForUser(userId), currency)
    ?? legacyDigital;
  const cashAcct = await getAccountByKey(db, driverCashAccountKeyForUser(userId), currency);
  const debtAcct = await getAccountByKey(db, driverDebtAccountKeyForUser(userId), currency);

  return {
    currency,
    digital: walletBalanceFromMinor(digitalAcct?.balance_minor ?? 0, currency),
    cash: walletBalanceFromMinor(cashAcct?.balance_minor ?? 0, currency),
    debt: debtWalletBalanceFromMinor(debtAcct?.balance_minor ?? 0, currency),
  };
}

export interface PostJournalResult {
  inserted: number;
  skipped: boolean;
  conflict?: boolean;
}

export interface PostJournalParams {
  rideId: string | null;
  idempotencyKey: string;
  requestHash: string;
  currency: string;
  lines: JournalLineSpec[];
  createdByUserId: string | null;
}

function parseDriverSubAccountKey(key: string): { userId: string; subtype: "digital" | "cash" | "debt" } | null {
  const match = /^user:([^:]+):driver:(digital|cash|debt)$/.exec(key);
  if (!match) return null;
  return { userId: match[1], subtype: match[2] as "digital" | "cash" | "debt" };
}

function lineIdempotencyKey(baseKey: string, entryType: string): string {
  return `${baseKey}:${entryType}`;
}

function settlementLinePrefix(baseKey: string): string {
  return `${baseKey}:`;
}

/** Detect prior settlement rows for this ride (legacy single-key or per-line keys). */
async function findSettlementJournalRows(
  client: SupabaseClient,
  journalTable: string,
  rideId: string | null,
  baseKey: string,
): Promise<Array<{ id: string; entry_type: string; request_hash: string | null; idempotency_key: string }>> {
  if (!rideId) {
    const { data: legacy } = await client
      .from(journalTable)
      .select("id, entry_type, request_hash, idempotency_key")
      .is("ride_request_id", null)
      .eq("idempotency_key", baseKey);

    const { data: keyed } = await client
      .from(journalTable)
      .select("id, entry_type, request_hash, idempotency_key")
      .is("ride_request_id", null)
      .like("idempotency_key", `${settlementLinePrefix(baseKey)}%`);

    const merged = [...(legacy ?? []), ...(keyed ?? [])];
    const seen = new Set<string>();
    return merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }

  const { data: legacy } = await client
    .from(journalTable)
    .select("id, entry_type, request_hash, idempotency_key")
    .eq("ride_request_id", rideId)
    .eq("idempotency_key", baseKey);

  const { data: keyed } = await client
    .from(journalTable)
    .select("id, entry_type, request_hash, idempotency_key")
    .eq("ride_request_id", rideId)
    .like("idempotency_key", `${settlementLinePrefix(baseKey)}%`);

  const merged = [...(legacy ?? []), ...(keyed ?? [])];
  const seen = new Set<string>();
  return merged.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function postPaymentJournal(
  db: SupabaseClient | undefined,
  params: PostJournalParams,
): Promise<PostJournalResult> {
  const { rideId, idempotencyKey, requestHash, currency, lines, createdByUserId } = params;
  const { db: client, tables } = await paymentDb();

  const existingRows = await findSettlementJournalRows(
    client,
    tables.journal,
    rideId,
    idempotencyKey,
  );

  if (existingRows.length > 0) {
    const hashMismatch = existingRows.some(
      (row) => row.request_hash != null && String(row.request_hash) !== requestHash,
    );
    if (hashMismatch) {
      return { inserted: 0, skipped: false, conflict: true };
    }
    const existingTypes = new Set(existingRows.map((row) => String(row.entry_type)));
    const allPresent = lines.length === 0 || lines.every((line) => existingTypes.has(line.entry_type));
    if (allPresent) {
      return { inserted: 0, skipped: true };
    }
  }

  if (lines.length === 0) {
    return { inserted: 0, skipped: false };
  }

  const digitalCredits: Array<{ userId: string; amount: number }> = [];
  const existingTypes = new Set(existingRows.map((row) => String(row.entry_type)));

  let rideEntryTypes = new Set<string>();
  if (rideId) {
    const { data: rideJournalRows } = await client
      .from(tables.journal)
      .select("entry_type")
      .eq("ride_request_id", rideId);
    rideEntryTypes = new Set(
      (rideJournalRows ?? []).map((row) => String(row.entry_type)),
    );
  }

  let inserted = 0;
  for (const line of lines) {
    if (existingTypes.has(line.entry_type)) {
      continue;
    }
    if (rideEntryTypes.has(line.entry_type)) {
      continue;
    }

    const rowIdempotencyKey = lineIdempotencyKey(idempotencyKey, line.entry_type);

    const { data, error } = await client.rpc("rides_post_payment_journal_line", {
      p_ride_request_id: rideId,
      p_idempotency_key: rowIdempotencyKey,
      p_entry_type: line.entry_type,
      p_debit_account_key: line.debit_account_key,
      p_credit_account_key: line.credit_account_key,
      p_amount_minor: line.amount_minor,
      p_currency: currency,
      p_request_hash: requestHash,
      p_metadata: line.metadata,
      p_created_by_user_id: createdByUserId,
    });

    if (error) throw new Error(error.message);

    const lineResult = data as { inserted?: boolean; skipped?: boolean; conflict?: boolean };
    if (lineResult.conflict) {
      return { inserted: 0, skipped: false, conflict: true };
    }
    if (!lineResult.inserted) {
      continue;
    }

    try {
      await dualWriteRidesJournalLine(client, tables, {
        rideId,
        rowIdempotencyKey,
        entryType: line.entry_type,
        debitAccountKey: line.debit_account_key,
        creditAccountKey: line.credit_account_key,
        amountMinor: line.amount_minor,
        currency,
        requestHash,
        metadata: line.metadata,
        createdByUserId,
      });
    } catch (e) {
      console.error("[paymentAccounts] unified ledger dual-write failed:", e);
    }

    const creditSub = parseDriverSubAccountKey(line.credit_account_key);
    if (creditSub?.subtype === "digital") {
      digitalCredits.push({ userId: creditSub.userId, amount: line.amount_minor });
    }

    inserted++;
    rideEntryTypes.add(line.entry_type);
  }

  if (inserted > 0) {
    try {
      const { applyPendingDebt } = await import("../rides/cashSettlement/debtRepayment.ts");
      const seen = new Set<string>();
      for (const dc of digitalCredits) {
        if (seen.has(dc.userId)) continue;
        seen.add(dc.userId);
        await applyPendingDebt(db, dc.userId, currency, "digital_credit");
      }
    } catch (e) {
      console.error("[paymentAccounts] applyPendingDebt after journal failed:", e);
    }
  }

  return { inserted, skipped: false };
}

export async function listJournalForAccountKey(
  db: SupabaseClient | undefined,
  accountKey: string,
  currency: string,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const account = await getAccountByKey(db, accountKey, currency);
  if (!account) return [];

  const { db: client, tables } = await paymentDb();
  const { data: debits } = await client
    .from(tables.journal)
    .select("*")
    .eq("debit_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: credits } = await client
    .from(tables.journal)
    .select("*")
    .eq("credit_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const merged = [...(debits ?? []), ...(credits ?? [])];
  merged.sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
  return merged.slice(0, limit) as Array<Record<string, unknown>>;
}

export async function listJournalForAccount(
  db: SupabaseClient | undefined,
  userId: string,
  role: "rider" | "driver",
  currency: string,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const accountKey = role === "rider"
    ? riderAccountKeyForUser(userId)
    : driverAccountKeyForUser(userId);
  return listJournalForAccountKey(db, accountKey, currency, limit);
}

/** Map journal rows to signed amounts from the owning account's perspective. */
export function mapJournalRowsForAccount(
  accountId: string,
  rows: Array<Record<string, unknown>>,
): Array<{
  id: string;
  ride_request_id: string | null;
  entry_type: string;
  amount_minor: number;
  currency: string;
  description: string;
  created_at: string;
  is_credit: boolean;
  metadata: Record<string, unknown>;
}> {
  return rows.map((row) => {
    const creditId = String(row.credit_account_id ?? "");
    const isCredit = creditId === accountId;
    return {
      id: String(row.id),
      ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
      entry_type: String(row.entry_type),
      amount_minor: Number(row.amount_minor),
      currency: String(row.currency),
      description: journalEntryTitle(String(row.entry_type)),
      created_at: String(row.created_at),
      is_credit: isCredit,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
  });
}

export function journalEntryTitle(entryType: string): string {
  const titles: Record<string, string> = {
    cash_trip_arrears: "Outstanding balance",
    cash_change_debit: "Change credit",
    cash_change_credit: "Change credit to wallet",
    cash_trip_collection: "Cash collected",
    change_paid_from_digital: "Change paid from digital wallet",
    change_debt_open: "Change owed (debt)",
    debt_repay_from_digital: "Debt repayment",
    fare_allocation_from_cash: "Fare allocation",
    card_trip_digital_credit: "Card trip earnings",
    card_shortfall_payment: "Arrears paid by card",
    card_trip_rider_charge: "Trip paid by card",
    wallet_fare_from_rider: "Trip paid from wallet",
    wallet_fare_to_driver: "Digital fare credit",
    platform_fare_guarantee: "Platform fare guarantee",
    wallet_topup: "Wallet top-up",
    wallet_adjustment: "Wallet adjustment",
    cash_settlement_confirmed: "Cash settlement",
    admin_arrears_writeoff: "Balance adjustment",
    dispute_resolution_credit: "Dispute credit",
  };
  return titles[entryType] ?? entryType.replace(/_/g, " ");
}

/** Rider-facing transaction label (may differ from driver/admin journal titles). */
export function riderWalletTransactionTitle(
  entryType: string,
  metadata?: Record<string, unknown>,
): string {
  if (entryType === "card_trip_digital_credit") {
    if (metadata?.payment_source === "demo_lynk") return "Trip paid with Lynk";
    return "Trip paid by card";
  }
  if (entryType === "card_shortfall_payment") {
    if (metadata?.payment_source === "demo_lynk") return "Arrears paid with Lynk";
    if (metadata?.arrears_payment_source === "wallet") return "Arrears paid from wallet";
    return "Arrears paid by card";
  }
  return journalEntryTitle(entryType);
}
