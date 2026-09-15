/**
 * Admin write-off — forgive remittance receivable (not a cash settlement).
 * Q3 / V-3: event_type write_off only; no settlements row.
 */

import { writeOffIdempotencyKey } from "./money.ts";
import {
  getRemittanceAccount,
  postRemittanceWriteOff,
} from "./remittanceLedger.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any; rpc?: (...a: any[]) => any };

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

export const WRITE_OFF_REASON_CODES = [
  "inactive_courier",
  "uncollectible",
  "ops_error",
  "other",
] as const;

export type WriteOffReasonCode = (typeof WRITE_OFF_REASON_CODES)[number];

const REASON_SET = new Set<string>(WRITE_OFF_REASON_CODES);

export type WriteOffResult =
  | {
    ok: true;
    eventId: string;
    balanceBeforeMinor: number;
    balanceAfterMinor: number;
    stillPaused: boolean;
  }
  | { ok: false; status: number; error: string; code?: string; balanceMinor?: number };

/** Pure validation for Deno unit tests (no DB). */
export function validateWriteOffFields(input: {
  courierId: string;
  amountMinor: number;
  reasonCode: string;
  notes: string;
  expectedBalanceMinor: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!input.courierId.trim()) {
    return { ok: false, status: 400, error: "courier_required" };
  }
  const amount = Math.floor(Number(input.amountMinor) || 0);
  if (!(amount > 0)) {
    return { ok: false, status: 400, error: "amount_required" };
  }
  if (!REASON_SET.has(String(input.reasonCode || ""))) {
    return { ok: false, status: 400, error: "invalid_reason" };
  }
  const notes = String(input.notes ?? "").trim();
  if (notes.length < 8) {
    return { ok: false, status: 400, error: "notes_required" };
  }
  return { ok: true };
}

export async function writeOffRemittance(
  sb: Sb,
  input: {
    courierId: string;
    amountMinor: number;
    reasonCode: string;
    notes: string;
    expectedBalanceMinor: number;
    idempotencyKey: string;
    actorId: string;
  },
): Promise<WriteOffResult> {
  const fields = validateWriteOffFields(input);
  if (!fields.ok) return fields;

  const amount = Math.floor(Number(input.amountMinor));
  const key = writeOffIdempotencyKey(input.idempotencyKey);
  const db = deliveryDb(sb);

  // Replay-first (same pattern as settle R-4)
  const { data: priorEvent } = await db
    .from("courier_remittance_events")
    .select("id, balance_before_minor, balance_after_minor")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (priorEvent?.id) {
    const after = await getRemittanceAccount(sb, input.courierId);
    return {
      ok: true,
      eventId: String(priorEvent.id),
      balanceBeforeMinor: Number(priorEvent.balance_before_minor ?? 0),
      balanceAfterMinor: Number(priorEvent.balance_after_minor ?? 0),
      stillPaused: Boolean(after?.isPaused),
    };
  }

  const acct = await getRemittanceAccount(sb, input.courierId);
  if (!acct) {
    return { ok: false, status: 404, error: "account_not_found" };
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
      error: "overdraw",
      code: "remittance_overdraw",
      balanceMinor: acct.balanceMinor,
    };
  }

  try {
    const event = await postRemittanceWriteOff(sb, {
      courierId: input.courierId,
      amountMinor: amount,
      idempotencyKey: key,
      actorId: input.actorId,
      notes: String(input.notes).trim(),
      reasonCode: input.reasonCode,
    });
    const after = await getRemittanceAccount(sb, input.courierId);
    return {
      ok: true,
      eventId: String(event.id),
      balanceBeforeMinor: Number(event.balance_before_minor ?? 0),
      balanceAfterMinor: Number(event.balance_after_minor ?? 0),
      stillPaused: Boolean(after?.isPaused),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/overdraw/i.test(msg)) {
      return { ok: false, status: 422, error: "overdraw", code: "remittance_overdraw" };
    }
    return { ok: false, status: 500, error: msg };
  }
}
