import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  driverAccountKeyForUser,
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
  type JournalLineSpec,
} from "../rides/cashSettlement/buildJournalEntries.ts";

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

export async function getAccountByKey(
  db: SupabaseClient,
  accountKey: string,
  currency: string,
): Promise<PaymentAccountRow | null> {
  const { data, error } = await db
    .from("payment_accounts")
    .select("*")
    .eq("account_key", accountKey)
    .eq("currency", currency)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentAccountRow | null;
}

export async function ensurePaymentAccount(
  db: SupabaseClient,
  opts: {
    userId: string | null;
    role: "rider" | "driver" | "system";
    accountKey: string;
    currency: string;
  },
): Promise<PaymentAccountRow> {
  const existing = await getAccountByKey(db, opts.accountKey, opts.currency);
  if (existing) return existing;

  const { data, error } = await db
    .from("payment_accounts")
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

export async function getWalletBalance(
  db: SupabaseClient,
  userId: string,
  role: "rider" | "driver",
  currency: string,
): Promise<WalletBalanceView> {
  const accountKey = role === "rider"
    ? riderAccountKeyForUser(userId)
    : driverAccountKeyForUser(userId);
  const account = await getAccountByKey(db, accountKey, currency);
  if (!account) {
    return walletBalanceFromMinor(0, currency);
  }
  return walletBalanceFromMinor(account.balance_minor, currency);
}

export interface PostJournalResult {
  inserted: number;
  skipped: boolean;
  conflict?: boolean;
}

export interface PostJournalParams {
  rideId: string;
  idempotencyKey: string;
  requestHash: string;
  currency: string;
  lines: JournalLineSpec[];
  createdByUserId: string | null;
}

export async function postPaymentJournal(
  db: SupabaseClient,
  params: PostJournalParams,
): Promise<PostJournalResult> {
  const { rideId, idempotencyKey, requestHash, currency, lines, createdByUserId } = params;

  const { data: existing } = await db
    .from("payment_journal_entries")
    .select("id, request_hash")
    .eq("ride_request_id", rideId)
    .eq("idempotency_key", idempotencyKey)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (String(existing.request_hash) !== requestHash) {
      return { inserted: 0, skipped: false, conflict: true };
    }
    return { inserted: 0, skipped: true };
  }

  if (lines.length === 0) {
    return { inserted: 0, skipped: false };
  }

  const accountCache = new Map<string, PaymentAccountRow>();

  async function resolveAccountKey(key: string): Promise<PaymentAccountRow> {
    const cached = accountCache.get(key);
    if (cached) return cached;
    if (key === PLATFORM_RECEIVABLE_KEY) {
      const acct = await ensureSystemReceivableAccount(db, currency);
      accountCache.set(key, acct);
      return acct;
    }
    if (key.startsWith("user:") && key.endsWith(":rider")) {
      const userId = key.split(":")[1];
      const acct = await ensureRiderAccount(db, userId, currency);
      accountCache.set(key, acct);
      return acct;
    }
    if (key.startsWith("user:") && key.endsWith(":driver")) {
      const userId = key.split(":")[1];
      const acct = await ensureDriverAccount(db, userId, currency);
      accountCache.set(key, acct);
      return acct;
    }
    const acct = await getAccountByKey(db, key, currency);
    if (!acct) throw new Error(`account_not_found:${key}`);
    accountCache.set(key, acct);
    return acct;
  }

  let inserted = 0;
  for (const line of lines) {
    const debit = await resolveAccountKey(line.debit_account_key);
    const credit = await resolveAccountKey(line.credit_account_key);

    const { error: insertError } = await db.from("payment_journal_entries").insert({
      ride_request_id: rideId,
      idempotency_key: idempotencyKey,
      entry_type: line.entry_type,
      debit_account_id: debit.id,
      credit_account_id: credit.id,
      amount_minor: line.amount_minor,
      currency,
      request_hash: requestHash,
      metadata: line.metadata,
      created_by_user_id: createdByUserId,
    });

    if (insertError) {
      if (String(insertError.code) === "23505") {
        const { data: dup } = await db
          .from("payment_journal_entries")
          .select("request_hash")
          .eq("ride_request_id", rideId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (dup && String(dup.request_hash) !== requestHash) {
          return { inserted: 0, skipped: false, conflict: true };
        }
        return { inserted: 0, skipped: true };
      }
      throw new Error(insertError.message);
    }

    const newDebitBalance = Number(debit.balance_minor) - line.amount_minor;
    const newCreditBalance = Number(credit.balance_minor) + line.amount_minor;

    const { error: debitErr } = await db
      .from("payment_accounts")
      .update({ balance_minor: newDebitBalance })
      .eq("id", debit.id);
    if (debitErr) throw new Error(debitErr.message);

    const { error: creditErr } = await db
      .from("payment_accounts")
      .update({ balance_minor: newCreditBalance })
      .eq("id", credit.id);
    if (creditErr) throw new Error(creditErr.message);

    debit.balance_minor = newDebitBalance;
    credit.balance_minor = newCreditBalance;
    inserted++;
  }

  return { inserted, skipped: false };
}

export async function listJournalForAccount(
  db: SupabaseClient,
  userId: string,
  role: "rider" | "driver",
  currency: string,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const accountKey = role === "rider"
    ? riderAccountKeyForUser(userId)
    : driverAccountKeyForUser(userId);
  const account = await getAccountByKey(db, accountKey, currency);
  if (!account) return [];

  const { data: debits } = await db
    .from("payment_journal_entries")
    .select("*")
    .eq("debit_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: credits } = await db
    .from("payment_journal_entries")
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
