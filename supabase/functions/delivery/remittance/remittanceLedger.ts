/**
 * Thin RPC wrapper — the ONLY caller of delivery.apply_remittance_event from edge.
 * Layer A′ remittance; never Log Cash / Settlement Week vocabulary.
 */

import {
  collectIdempotencyKey,
  settleIdempotencyKey,
  toMinor,
} from "./money.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; rpc?: (...a: any[]) => any; from: (t: string) => any };

export type RemittanceEventRow = {
  id: string;
  courier_id: string;
  idempotency_key: string;
  event_type: string;
  amount_minor: number;
  balance_before_minor: number;
  balance_after_minor: number;
  order_id?: string | null;
  is_paused?: boolean;
};

export type PostCollectedInput = {
  courierId: string;
  orderId: string;
  bagTotalMinor: number;
  platformDueMinor: number;
  merchantDueMinor: number;
  courierRetainedMinor: number;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

export async function postRemittanceCollected(
  sb: Sb,
  input: PostCollectedInput,
): Promise<RemittanceEventRow> {
  const amountMinor = Math.max(0, input.platformDueMinor + input.merchantDueMinor);
  const db = deliveryDb(sb);
  const { data, error } = await db.rpc("apply_remittance_event", {
    p_courier_id: input.courierId,
    p_event_type: "collected",
    p_amount_minor: amountMinor,
    p_idempotency_key: collectIdempotencyKey(input.orderId),
    p_order_id: input.orderId,
    p_bag_total_minor: input.bagTotalMinor,
    p_platform_due_minor: input.platformDueMinor,
    p_merchant_due_minor: input.merchantDueMinor,
    p_courier_retained_minor: input.courierRetainedMinor,
    p_actor_id: input.actorId ?? null,
    p_actor_type: "system",
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message || "apply_remittance_event failed");
  return data as RemittanceEventRow;
}

export async function postRemittanceSettled(
  sb: Sb,
  input: {
    courierId: string;
    amountMinor: number;
    settlementId: string;
    idempotencyKey: string;
    actorId: string | null;
    notes?: string | null;
  },
): Promise<RemittanceEventRow> {
  const db = deliveryDb(sb);
  const { data, error } = await db.rpc("apply_remittance_event", {
    p_courier_id: input.courierId,
    p_event_type: "settled",
    p_amount_minor: -Math.abs(input.amountMinor),
    p_idempotency_key: input.idempotencyKey.startsWith("cod:settle:")
      ? input.idempotencyKey
      : settleIdempotencyKey(input.idempotencyKey),
    p_settlement_id: input.settlementId,
    p_actor_id: input.actorId,
    p_actor_type: "admin",
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message || "apply_remittance_event settle failed");
  return data as RemittanceEventRow;
}

export async function getRemittanceAccount(
  sb: Sb,
  courierId: string,
): Promise<{
  courierId: string;
  balanceMinor: number;
  thresholdMinor: number;
  isPaused: boolean;
  pausedSince: string | null;
} | null> {
  const db = deliveryDb(sb);
  const { data, error } = await db
    .from("courier_remittance_accounts")
    .select(
      "courier_id, balance_minor, pause_threshold_minor, is_paused, paused_since",
    )
    .eq("courier_id", courierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    courierId: String(data.courier_id),
    balanceMinor: Number(data.balance_minor ?? 0),
    thresholdMinor: Number(data.pause_threshold_minor ?? 1000000),
    isPaused: Boolean(data.is_paused),
    pausedSince: data.paused_since ? String(data.paused_since) : null,
  };
}

export async function isCourierRemittancePaused(
  sb: Sb,
  courierId: string,
): Promise<{ isPaused: boolean; balanceMinor: number; thresholdMinor: number }> {
  const acct = await getRemittanceAccount(sb, courierId);
  if (!acct) return { isPaused: false, balanceMinor: 0, thresholdMinor: 1000000 };
  return {
    isPaused: acct.isPaused,
    balanceMinor: acct.balanceMinor,
    thresholdMinor: acct.thresholdMinor,
  };
}

export { toMinor, collectIdempotencyKey };
