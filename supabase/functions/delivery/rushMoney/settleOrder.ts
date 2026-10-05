import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cashSettleLines, settleLines } from "../../_shared/rushMoney/journalLines.ts";
import type { DashOrderFeeFields } from "../../_shared/dashMoneySplit.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

function publicDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Move card money from holding into restaurant, courier, and Roam when the order is delivered. */
export async function settleDeliveredOrder(sb: Sb, orderId: string): Promise<void> {
  const { data: order } = await sb
    .from("orders")
    .select("id, total, money_state, payment_status, payment_method, cash_collected_minor, merchant_id, courier_id, platform_fee, service_fee, processing_fee, delivery_fee, tip, courier_tip_net, subtotal, discount, merchant_commission_amount, delivery_fee_platform_amount, delivery_fee_courier_amount, peak_pay_amount, tax_food_jmd, tax_platform_jmd, small_order_fee")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const state = String(order.money_state || "");
  const method = String((order as { payment_method?: string }).payment_method || "");
  const cash = method === "cash" || method === "cod";
  if (!cash && state !== "captured" && state !== "partially_refunded" && state !== "settled") return;
  if (cash && state !== "collected" && state !== "short_collected" && state !== "captured") return;

  let collectedMajor = cash
    ? Number((order as { cash_collected_minor?: number }).cash_collected_minor || 0) / 100
    : Number(order.total || 0);
  if (!cash) {
    const { data: refunds } = await publicDb().schema("payments").from("refunds")
      .select("amount, status").eq("order_id", orderId).in("status", ["completed", "succeeded"]);
    const refunded = (refunds || []).reduce((sum: number, row: { amount?: number }) => sum + Number(row.amount || 0), 0);
    collectedMajor = Math.max(0, collectedMajor - refunded);
  }
  if (collectedMajor <= 0) {
    await publicDb().rpc("rush_transition_money_state", { p_order_id: orderId, p_to: "settled" });
    return;
  }
  const lines = cash
    ? cashSettleLines(order as DashOrderFeeFields, orderId, collectedMajor || Number(order.total || 0))
    : settleLines(order as DashOrderFeeFields, orderId, collectedMajor);
  const db = publicDb();
  const { error } = await db.rpc("rush_post_journal", {
    p_idempotency_key: `settle:${orderId}`,
    p_event_type: "settle_order",
    p_order_id: orderId,
    p_correlation_id: null,
    p_lines: lines,
    p_actor_type: "system",
    p_reason: "Delivered",
    p_evidence: {},
    p_policy_version: null,
  });
  if (error) {
    console.error("[rush-money] settle journal", error.message);
    return;
  }
  await db.rpc("rush_transition_money_state", { p_order_id: orderId, p_to: "settled" });
}
