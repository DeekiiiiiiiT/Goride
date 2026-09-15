/**
 * Admin remittance settle + reverse (Layer A′).
 * R-3 pending/void · R-4 replay-first · R-8 sequence refs.
 */

import { reverseIdempotencyKey } from "./money.ts";
import {
  getRemittanceAccount,
  postRemittanceSettled,
} from "./remittanceLedger.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any; rpc?: (...a: any[]) => any };

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

const METHODS = new Set([
  "lynk",
  "bank_transfer",
  "cash_office",
  "wipay",
  "payout_offset",
  "other",
]);

async function nextReference(db: ReturnType<typeof deliveryDb>): Promise<string> {
  const y = new Date().getUTCFullYear();
  try {
    const { data, error } = await db.rpc("next_remittance_settlement_ref", {
      p_year: y,
    });
    if (!error && data) return String(data);
  } catch {
    /* fall through */
  }
  // Fallback only if sequence RPC missing in older envs
  const n = Math.floor(Math.random() * 900000) + 100000;
  return `RMT-${y}-${n}`;
}

export type SettleResult =
  | {
    ok: true;
    reference: string;
    settlementId: string;
    balanceBeforeMinor: number;
    balanceAfterMinor: number;
    stillPaused: boolean;
  }
  | { ok: false; status: number; error: string; code?: string; balanceMinor?: number };

export async function settleRemittance(
  sb: Sb,
  input: {
    courierId: string;
    amountMinor: number;
    method: string;
    expectedBalanceMinor: number;
    idempotencyKey: string;
    actorId: string;
    notes?: string | null;
    externalRef?: string | null;
  },
): Promise<SettleResult> {
  const method = String(input.method || "").toLowerCase();
  if (!METHODS.has(method)) {
    return { ok: false, status: 400, error: "invalid_method" };
  }
  const amount = Math.floor(Number(input.amountMinor) || 0);
  if (!(amount > 0)) {
    return { ok: false, status: 400, error: "amount_required" };
  }

  const db = deliveryDb(sb);
  const settleKey = input.idempotencyKey.startsWith("cod:settle:")
    ? input.idempotencyKey
    : `cod:settle:v1:${input.idempotencyKey}`;

  // R-4: replay lookup BEFORE expected-balance check
  const { data: priorEvent } = await db
    .from("courier_remittance_events")
    .select("id, settlement_id, balance_before_minor, balance_after_minor")
    .eq("idempotency_key", settleKey)
    .maybeSingle();
  if (priorEvent?.settlement_id) {
    const { data: priorSettle } = await db
      .from("courier_remittance_settlements")
      .select("reference, amount_minor, status")
      .eq("id", priorEvent.settlement_id)
      .maybeSingle();
    const after = await getRemittanceAccount(sb, input.courierId);
    return {
      ok: true,
      reference: String(priorSettle?.reference ?? ""),
      settlementId: String(priorEvent.settlement_id),
      balanceBeforeMinor: Number(priorEvent.balance_before_minor ?? 0),
      balanceAfterMinor: Number(priorEvent.balance_after_minor ?? 0),
      stillPaused: Boolean(after?.isPaused),
    };
  }

  const acct = await getRemittanceAccount(sb, input.courierId);
  if (!acct) {
    return { ok: false, status: 404, error: "account_not_found", code: "C-4" };
  }
  if (acct.balanceMinor !== Math.floor(input.expectedBalanceMinor)) {
    return {
      ok: false,
      status: 409,
      error: "balance_changed",
      code: "stale_balance",
      balanceMinor: acct.balanceMinor,
    };
  }
  if (amount > acct.balanceMinor) {
    return {
      ok: false,
      status: 422,
      error: "cannot settle more than owed",
      code: "overdraw",
      balanceMinor: acct.balanceMinor,
    };
  }

  const settlementId = crypto.randomUUID();
  const reference = await nextReference(db);

  const { error: insErr } = await db.from("courier_remittance_settlements").insert({
    id: settlementId,
    reference,
    courier_id: input.courierId,
    amount_minor: amount,
    method,
    status: "pending",
    balance_before_minor: acct.balanceMinor,
    notes: input.notes ?? null,
    external_ref: input.externalRef ?? null,
    recorded_by: input.actorId,
  });
  if (insErr) {
    return { ok: false, status: 500, error: insErr.message };
  }

  try {
    const event = await postRemittanceSettled(sb, {
      courierId: input.courierId,
      amountMinor: amount,
      settlementId,
      idempotencyKey: settleKey,
      actorId: input.actorId,
      notes: input.notes,
    });

    await db
      .from("courier_remittance_settlements")
      .update({ status: "posted" })
      .eq("id", settlementId);

    const after = await getRemittanceAccount(sb, input.courierId);
    return {
      ok: true,
      reference,
      settlementId,
      balanceBeforeMinor: Number(event.balance_before_minor ?? acct.balanceMinor),
      balanceAfterMinor: Number(
        event.balance_after_minor ?? (acct.balanceMinor - amount),
      ),
      stillPaused: Boolean(after?.isPaused),
    };
  } catch (e) {
    await db
      .from("courier_remittance_settlements")
      .update({ status: "void" })
      .eq("id", settlementId);
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function reverseSettlement(
  sb: Sb,
  settlementId: string,
  actorId: string,
): Promise<SettleResult> {
  const db = deliveryDb(sb);
  const { data: settle } = await db
    .from("courier_remittance_settlements")
    .select("*")
    .eq("id", settlementId)
    .maybeSingle();
  if (!settle) return { ok: false, status: 404, error: "settlement_not_found" };
  if (String(settle.status) === "reversed") {
    return { ok: false, status: 409, error: "already_reversed" };
  }
  if (String(settle.status) !== "posted") {
    return {
      ok: false,
      status: 422,
      error: "only_posted_settlements_reversible",
      code: String(settle.status),
    };
  }

  const { data: settledEvent } = await db
    .from("courier_remittance_events")
    .select("id, amount_minor")
    .eq("settlement_id", settlementId)
    .eq("event_type", "settled")
    .maybeSingle();
  if (!settledEvent) {
    return { ok: false, status: 404, error: "settled_event_not_found" };
  }

  const amount = Math.abs(Number(settledEvent.amount_minor) || 0);
  const { data, error } = await db.rpc("apply_remittance_event", {
    p_courier_id: settle.courier_id,
    p_event_type: "reversal",
    p_amount_minor: amount,
    p_idempotency_key: reverseIdempotencyKey(String(settledEvent.id)),
    p_reversal_of: settledEvent.id,
    p_settlement_id: settlementId,
    p_actor_id: actorId,
    p_actor_type: "admin",
    p_notes: `Reversal of ${settle.reference}`,
  });
  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  await db
    .from("courier_remittance_settlements")
    .update({ status: "reversed" })
    .eq("id", settlementId);

  const after = await getRemittanceAccount(sb, String(settle.courier_id));
  return {
    ok: true,
    reference: String(settle.reference),
    settlementId,
    balanceBeforeMinor: Number(data?.balance_before_minor ?? 0),
    balanceAfterMinor: Number(data?.balance_after_minor ?? 0),
    stillPaused: Boolean(after?.isPaused),
  };
}
