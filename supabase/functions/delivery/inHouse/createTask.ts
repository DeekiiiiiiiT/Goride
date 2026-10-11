import { notifyCustomerOrderStatus } from "../../_shared/dashOrderSms.ts";
import { customerStatusForTask } from "./orderStatus.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

/** Refuse a cart line that has no restaurant price. Do not guess from the customer price. */
export function expectedCostMinor(items: unknown): { ok: true; cost: number } | { ok: false } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false };
  let cost = 0;
  for (const raw of items) {
    const item = raw as { quantity?: number; in_store_price?: number | null };
    if (item.in_store_price == null || !Number.isFinite(Number(item.in_store_price))) return { ok: false };
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    cost += Math.round(Number(item.in_store_price) * 100) * qty;
  }
  return { ok: true, cost };
}

export function pickupName(orderNumber: string): string {
  const number = String(orderNumber || "").trim();
  return number ? `Roam ${number}` : "Roam";
}

async function insertTask(sb: Sb, orderId: string, merchantId: string, cost: number, code: string) {
  const { data, error } = await sb.from("procurement_tasks").insert({
    order_id: orderId,
    merchant_id: merchantId,
    state: "queued",
    pickup_code: code,
    expected_cost_minor: cost,
  }).select("id, state").maybeSingle();
  if (error || !data) throw new Error(error?.message || "Could not create the buyer task");
  return data;
}

/** Create the buyer task only after the customer's card payment is captured. */
export async function ensureProcurementTask(sb: Sb, orderId: string): Promise<void> {
  const { data: existing } = await sb.from("procurement_tasks").select("id").eq("order_id", orderId).maybeSingle();
  if (existing) return;

  const { data: order } = await sb.from("orders")
    .select("id, order_number, merchant_id, items, status, money_state, payment_status, payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  if (String(order.payment_method || "") !== "wipay") return;
  const paid = String(order.money_state || "") === "captured" || String(order.payment_status || "") === "paid";
  if (!paid) return;

  const { data: merchant } = await sb.from("merchants")
    .select("id, procurement_mode")
    .eq("id", order.merchant_id)
    .maybeSingle();
  if (String(merchant?.procurement_mode || "") !== "in_house") return;

  const cost = expectedCostMinor(order.items);
  if (!cost.ok) return;

  const task = await insertTask(sb, orderId, String(order.merchant_id), cost.cost, pickupName(String(order.order_number || "")));
  await sb.from("procurement_events").insert({
    task_id: task.id,
    from_state: null,
    to_state: "queued",
    actor_type: "system",
    payload: { expected_cost_minor: cost.cost },
  });

  const nextStatus = customerStatusForTask("queued");
  if (nextStatus && String(order.status) === "placed") {
    await sb.from("orders").update({
      status: nextStatus,
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "placed");
    await sb.from("order_events").insert({
      order_id: orderId,
      status: nextStatus,
      actor_type: "system",
      notes: "Order confirmed",
    });
    await notifyCustomerOrderStatus(sb, orderId, nextStatus);
  }
}
