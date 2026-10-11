import { notifyCustomerOrderStatus } from "../../_shared/dashOrderSms.ts";
import { readyStatusAllowed } from "./deskRules.ts";
import { transitionOrThrow } from "./orderStatus.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

const ALLOWED = new Set(["accepted", "preparing", "ready"]);
const FROM: Record<string, string[]> = {
  accepted: ["placed"],
  preparing: ["accepted", "placed"],
  ready: ["preparing", "accepted"],
};

/** Concierge moves an In-House order. Ready also sends courier offers. */
export async function applyConciergeOrderStatus(
  sb: Sb,
  input: { orderId: string; status: string; actorId?: string | null; notes?: string | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!ALLOWED.has(input.status)) {
    return { ok: false, status: 400, error: "That status is not available" };
  }
  const { data: order } = await sb.from("orders")
    .select("id, status, merchant_id")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, error: "Order not found" };

  const { data: merchant } = await sb.from("merchants")
    .select("procurement_mode")
    .eq("id", order.merchant_id)
    .maybeSingle();
  if (String(merchant?.procurement_mode || "") !== "in_house") {
    return { ok: false, status: 409, error: "This order cannot be updated" };
  }

  if (String(order.status) === input.status) return { ok: true };
  if (!(FROM[input.status] || []).includes(String(order.status))) {
    return { ok: false, status: 409, error: "This order cannot move to that status" };
  }

  const { data: task } = await sb.from("procurement_tasks")
    .select("id, state")
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (input.status === "ready" && !readyStatusAllowed(String(task?.state || ""), String(order.status))) {
    return { ok: false, status: 409, error: "The restaurant order is not placed yet" };
  }

  const now = new Date().toISOString();
  const patch: Record<string, string> = { status: input.status, updated_at: now };
  if (input.status === "accepted") patch.accepted_at = now;
  if (input.status === "preparing") patch.preparing_at = now;
  if (input.status === "ready") patch.ready_at = now;
  const { data: updated, error } = await sb.from("orders").update(patch)
    .eq("id", input.orderId)
    .eq("status", order.status)
    .select("id");
  if (error) return { ok: false, status: 500, error: error.message };
  if (!updated?.length) return { ok: false, status: 409, error: "This order changed while it was being updated" };

  await sb.from("order_events").insert({
    order_id: input.orderId,
    status: input.status,
    actor_type: "system",
    actor_id: input.actorId ?? null,
    notes: input.notes ?? null,
  });

  if (input.status === "ready" && task && task.state === "placed_external") {
    const next = transitionOrThrow(String(task.state), "dispatch");
    await sb.from("procurement_tasks").update({ state: next, updated_at: now }).eq("id", task.id).eq("state", "placed_external");
    await sb.from("procurement_events").insert({
      task_id: task.id,
      from_state: task.state,
      to_state: next,
      actor_id: input.actorId ?? null,
      actor_type: "system",
      payload: {},
    });
    const { dispatchOffersForOrder } = await import("../courierConsumerRoutes.ts");
    await dispatchOffersForOrder(sb, input.orderId);
  }

  await notifyCustomerOrderStatus(sb, input.orderId, input.status);
  return { ok: true };
}
