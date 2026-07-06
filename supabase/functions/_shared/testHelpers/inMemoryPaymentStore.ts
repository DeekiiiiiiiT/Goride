/**
 * In-memory Supabase-shaped store for payment_accounts + payment_journal_entries.
 * Implements atomic delta posting via rides_post_payment_journal_line RPC mock.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesPaymentTables } from "../ridesPaymentDb.ts";

export type PaymentAccountRow = {
  id: string;
  user_id: string | null;
  role: string;
  account_key: string;
  currency: string;
  balance_minor: number;
  created_at: string;
};

export type PaymentJournalRow = {
  id: string;
  ride_request_id: string | null;
  idempotency_key: string;
  entry_type: string;
  debit_account_id: string;
  credit_account_id: string;
  amount_minor: number;
  currency: string;
  request_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by_user_id: string | null;
};

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: null }
  | { kind: "like"; column: string; pattern: string };

function matchesLike(value: unknown, pattern: string): boolean {
  const str = String(value ?? "");
  if (!pattern.endsWith("%")) return str === pattern;
  return str.startsWith(pattern.slice(0, -1));
}

function rowMatches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.kind === "eq") return value === filter.value;
    if (filter.kind === "is") return value === null;
    return matchesLike(value, filter.pattern);
  });
}

function cloneRow<T extends Record<string, unknown>>(row: T): T {
  return { ...row };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export class InMemoryPaymentStore {
  accounts: PaymentAccountRow[] = [];
  journal: PaymentJournalRow[] = [];

  seedSystemAccounts(currency = "JMD"): void {
    for (const accountKey of ["platform:receivable", "platform:clearing"]) {
      if (!this.accounts.some((a) => a.account_key === accountKey && a.currency === currency)) {
        this.accounts.push({
          id: nextId("acct"),
          user_id: null,
          role: "system",
          account_key: accountKey,
          currency,
          balance_minor: 0,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  getAccountBalance(accountKey: string, currency: string): number {
    const row = this.accounts.find(
      (a) => a.account_key === accountKey && a.currency === currency,
    );
    return row?.balance_minor ?? 0;
  }

  private ensureAccountByKey(
    accountKey: string,
    currency: string,
    opts?: { userId?: string | null; role?: string },
  ): PaymentAccountRow {
    const existing = this.accounts.find(
      (a) => a.account_key === accountKey && a.currency === currency,
    );
    if (existing) return existing;

    const row: PaymentAccountRow = {
      id: nextId("acct"),
      user_id: opts?.userId ?? null,
      role: opts?.role ?? "rider",
      account_key: accountKey,
      currency,
      balance_minor: 0,
      created_at: new Date().toISOString(),
    };
    this.accounts.push(row);
    return row;
  }

  private resolveAccountId(accountKey: string, currency: string): string {
    if (accountKey === "platform:receivable" || accountKey === "platform:clearing") {
      return this.ensureAccountByKey(accountKey, currency, { role: "system" }).id;
    }
    const driverSub = /^user:([^:]+):driver:(digital|cash|debt)$/.exec(accountKey);
    if (driverSub) {
      return this.ensureAccountByKey(accountKey, currency, {
        userId: driverSub[1],
        role: "driver",
      }).id;
    }
    const riderMatch = /^user:([^:]+):rider$/.exec(accountKey);
    if (riderMatch) {
      return this.ensureAccountByKey(accountKey, currency, {
        userId: riderMatch[1],
        role: "rider",
      }).id;
    }
    const driverMatch = /^user:([^:]+):driver$/.exec(accountKey);
    if (driverMatch) {
      return this.ensureAccountByKey(accountKey, currency, {
        userId: driverMatch[1],
        role: "driver",
      }).id;
    }
    const found = this.accounts.find(
      (a) => a.account_key === accountKey && a.currency === currency,
    );
    if (!found) throw new Error(`account_not_found:${accountKey}`);
    return found.id;
  }

  /** Mirrors rides.post_payment_journal_line — synchronous for test concurrency safety. */
  postPaymentJournalLineRpc(params: {
    p_ride_request_id: string | null;
    p_idempotency_key: string;
    p_entry_type: string;
    p_debit_account_key: string;
    p_credit_account_key: string;
    p_amount_minor: number;
    p_currency: string;
    p_request_hash: string;
    p_metadata?: Record<string, unknown>;
    p_created_by_user_id?: string | null;
  }): { inserted: boolean; skipped: boolean; conflict: boolean } {
    const amount = Number(params.p_amount_minor);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("invalid_amount_minor");
    }

    const debitId = this.resolveAccountId(params.p_debit_account_key, params.p_currency);
    const creditId = this.resolveAccountId(params.p_credit_account_key, params.p_currency);

    const lockOrder = [debitId, creditId].sort();
    const debit = this.accounts.find((a) => a.id === debitId)!;
    const credit = this.accounts.find((a) => a.id === creditId)!;
    void lockOrder;

    const rideId = params.p_ride_request_id;
    const duplicate = this.journal.find(
      (j) => j.ride_request_id === rideId && j.idempotency_key === params.p_idempotency_key,
    );
    if (duplicate) {
      if (
        duplicate.request_hash != null &&
        String(duplicate.request_hash) !== String(params.p_request_hash)
      ) {
        return { inserted: false, skipped: false, conflict: true };
      }
      return { inserted: false, skipped: true, conflict: false };
    }

    this.journal.push({
      id: nextId("journal"),
      ride_request_id: rideId,
      idempotency_key: params.p_idempotency_key,
      entry_type: params.p_entry_type,
      debit_account_id: debitId,
      credit_account_id: creditId,
      amount_minor: amount,
      currency: params.p_currency,
      request_hash: params.p_request_hash,
      metadata: params.p_metadata ?? {},
      created_at: new Date().toISOString(),
      created_by_user_id: params.p_created_by_user_id ?? null,
    });

    debit.balance_minor -= amount;
    credit.balance_minor += amount;

    return { inserted: true, skipped: false, conflict: false };
  }

  asRidesPaymentDb(): { db: SupabaseClient; tables: RidesPaymentTables } {
    const tables: RidesPaymentTables = {
      accounts: "payment_accounts",
      journal: "payment_journal_entries",
      obligations: "payment_obligations",
    };
    const store = this;

    const client = {
      from(table: string) {
        return new QueryBuilder(store, table);
      },
      rpc(fn: string, params: Record<string, unknown>) {
        if (fn !== "rides_post_payment_journal_line") {
          return Promise.resolve({
            data: null,
            error: { message: `unknown rpc: ${fn}` },
          });
        }
        try {
          const result = store.postPaymentJournalLineRpc(
            params as Parameters<InMemoryPaymentStore["postPaymentJournalLineRpc"]>[0],
          );
          return Promise.resolve({ data: result, error: null });
        } catch (e) {
          return Promise.resolve({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          });
        }
      },
    };

    return { db: client as unknown as SupabaseClient, tables };
  }
}

class QueryBuilder {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" = "select";
  private selectColumns = "*";
  private insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private orderColumn: string | null = null;
  private orderAsc = false;
  private limitCount: number | null = null;
  private singleMode: "none" | "single" | "maybeSingle" = "none";
  private returnInserted = false;

  constructor(
    private store: InMemoryPaymentStore,
    private table: string,
  ) {}

  select(columns = "*") {
    if (this.op === "insert") {
      this.returnInserted = true;
      this.selectColumns = columns;
      return this;
    }
    this.op = "select";
    this.selectColumns = columns;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.op = "update";
    this.updatePayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: null) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  like(column: string, pattern: string) {
    this.filters.push({ kind: "like", column, pattern });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAsc = opts?.ascending ?? false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private rows(): Array<PaymentAccountRow | PaymentJournalRow> {
    if (this.table === "payment_accounts") return this.store.accounts;
    if (this.table === "payment_journal_entries") return this.store.journal;
    return [];
  }

  private execute(): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    if (this.op === "insert") return Promise.resolve(this.runInsert());
    if (this.op === "update") return Promise.resolve(this.runUpdate());
    return Promise.resolve(this.runSelect());
  }

  private runSelect(): { data: unknown; error: null } {
    let matched = this.rows().filter((row) =>
      rowMatches(row as Record<string, unknown>, this.filters)
    );

    if (this.orderColumn) {
      const col = this.orderColumn;
      matched = [...matched].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[col] ?? "");
        const bv = String((b as Record<string, unknown>)[col] ?? "");
        const cmp = av.localeCompare(bv);
        return this.orderAsc ? cmp : -cmp;
      });
    }

    if (this.limitCount != null) {
      matched = matched.slice(0, this.limitCount);
    }

    const projected = this.projectRows(matched);

    if (this.singleMode === "single") {
      if (projected.length !== 1) {
        throw new Error(`Expected single row, got ${projected.length}`);
      }
      return { data: projected[0], error: null };
    }
    if (this.singleMode === "maybeSingle") {
      return { data: projected[0] ?? null, error: null };
    }
    return { data: projected, error: null };
  }

  private projectRows(
    rows: Array<PaymentAccountRow | PaymentJournalRow>,
  ): Array<Record<string, unknown>> {
    if (this.selectColumns === "*") {
      return rows.map((row) => cloneRow(row as Record<string, unknown>));
    }
    const columns = this.selectColumns.split(",").map((c) => c.trim());
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        out[col] = (row as Record<string, unknown>)[col];
      }
      return out;
    });
  }

  private runInsert(): { data: unknown; error: { code?: string; message: string } | null } {
    const payloads = Array.isArray(this.insertPayload)
      ? this.insertPayload
      : [this.insertPayload ?? {}];

    const inserted: Array<Record<string, unknown>> = [];

    for (const payload of payloads) {
      if (this.table === "payment_accounts") {
        const accountKey = String(payload.account_key ?? "");
        const currency = String(payload.currency ?? "JMD");
        const duplicate = this.store.accounts.some(
          (a) => a.account_key === accountKey && a.currency === currency,
        );
        if (duplicate) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row: PaymentAccountRow = {
          id: nextId("acct"),
          user_id: (payload.user_id as string | null) ?? null,
          role: String(payload.role ?? "rider"),
          account_key: accountKey,
          currency,
          balance_minor: Number(payload.balance_minor ?? 0),
          created_at: new Date().toISOString(),
        };
        this.store.accounts.push(row);
        inserted.push(cloneRow(row));
        continue;
      }

      if (this.table === "payment_journal_entries") {
        const rideId = (payload.ride_request_id as string | null) ?? null;
        const idempotencyKey = String(payload.idempotency_key ?? "");
        const duplicate = this.store.journal.some(
          (j) => j.ride_request_id === rideId && j.idempotency_key === idempotencyKey,
        );
        if (duplicate) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row: PaymentJournalRow = {
          id: nextId("journal"),
          ride_request_id: rideId,
          idempotency_key: idempotencyKey,
          entry_type: String(payload.entry_type ?? ""),
          debit_account_id: String(payload.debit_account_id ?? ""),
          credit_account_id: String(payload.credit_account_id ?? ""),
          amount_minor: Number(payload.amount_minor ?? 0),
          currency: String(payload.currency ?? "JMD"),
          request_hash: (payload.request_hash as string | null) ?? null,
          metadata: (payload.metadata as Record<string, unknown>) ?? {},
          created_at: new Date().toISOString(),
          created_by_user_id: (payload.created_by_user_id as string | null) ?? null,
        };
        this.store.journal.push(row);
        inserted.push(cloneRow(row));
      }
    }

    if (this.singleMode === "single") {
      return { data: inserted[0] ?? null, error: null };
    }
    if (this.returnInserted) {
      return { data: inserted, error: null };
    }
    return { data: inserted, error: null };
  }

  private runUpdate(): { data: unknown; error: null } {
    const rows = this.rows();
    for (const row of rows) {
      if (!rowMatches(row as Record<string, unknown>, this.filters)) continue;
      Object.assign(row, this.updatePayload ?? {});
    }
    return { data: null, error: null };
  }
}
