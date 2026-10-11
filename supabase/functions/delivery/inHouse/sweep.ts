import { foodWasPurchased, transitionOrThrow } from "./orderStatus.ts";
import { slaLevel } from "./deskRules.ts";
import { deskIsStaffed, inHouseGloballyEnabled, storeOpenNow } from "./visibility.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

const TRAVEL_MINUTES = 12;
const BUFFER_MINUTES = 3;

async function warnTask(sb: Sb, task: { id: string }, nowIso: string) {
  await sb.from("procurement_tasks").update({
    sla_warned_at: nowIso,
    updated_at: nowIso,
  }).eq("id", task.id).is("sla_warned_at", null);
}

/** Release idle claims, refund orders nobody claimed, and send the courier at the ready time. */
export async function runInHouseSweep(sb: Sb, now = new Date()): Promise<Record<string, number>> {
  const iso = now.toISOString();
  let released = 0;
  let refunded = 0;
  let dispatched = 0;
  let warned = 0;
  let paged = 0;
  let tasksCreated = 0;

  const { data: staleClaims } = await sb.from("procurement_tasks")
    .select("id, order_id, state")
    .eq("state", "claimed")
    .lt("claim_expires_at", iso);
  for (const task of staleClaims || []) {
    const { data: updated } = await sb.from("procurement_tasks").update({
      state: "queued",
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
      updated_at: iso,
    }).eq("id", task.id).eq("state", "claimed").select("id");
    if (!updated?.length) continue;
    await sb.from("procurement_events").insert({
      task_id: task.id,
      from_state: "claimed",
      to_state: "queued",
      actor_type: "system",
      payload: { reason: "claim_expired" },
    });
    released += 1;
  }

  const { data: queued } = await sb.from("procurement_tasks")
    .select("id, created_at, sla_warned_at")
    .eq("state", "queued");
  for (const task of queued || []) {
    if (slaLevel(String(task.created_at), now, Boolean(task.sla_warned_at)) === "warn") {
      await warnTask(sb, task, iso);
      warned += 1;
    }
  }

  const { data: placing } = await sb.from("procurement_tasks")
    .select("id, state, claimed_at, created_at, sla_warned_at, sla_paged_at")
    .eq("state", "placing");
  for (const task of placing || []) {
    const started = String(task.claimed_at || task.created_at);
    const level = slaLevel(started, now, Boolean(task.sla_warned_at));
    if (level === "warn") {
      await warnTask(sb, task, iso);
      warned += 1;
    }
    if (level === "page" && !task.sla_paged_at) {
      const next = transitionOrThrow("placing", "exception");
      const { data: updated } = await sb.from("procurement_tasks").update({
        state: next,
        exception_code: "other",
        exception_note: "Buyer left the order while placing",
        sla_paged_at: iso,
        sla_warned_at: task.sla_warned_at || iso,
        updated_at: iso,
      }).eq("id", task.id).eq("state", "placing").select("id");
      if (updated?.length) {
        await sb.from("procurement_events").insert({
          task_id: task.id,
          from_state: "placing",
          to_state: next,
          actor_type: "system",
          payload: { code: "other", reason: "placing_sla" },
        });
        paged += 1;
      }
    }
  }

  const abandonBefore = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const { data: forgotten } = await sb.from("procurement_tasks")
    .select("id, order_id, state, created_at")
    .eq("state", "queued")
    .lt("created_at", abandonBefore);
  for (const task of forgotten || []) {
    const { cancelOrder } = await import("../rushMoney/cancelOrder.ts");
    const result = await cancelOrder(sb, {
      orderId: String(task.order_id),
      actor: "system",
      reason: "desk_unstaffed",
    });
    if (result.ok) refunded += 1;
  }

  const { data: due } = await sb.from("procurement_tasks")
    .select("id, order_id, state, dispatch_at")
    .eq("state", "placed_external")
    .lte("dispatch_at", iso);
  for (const task of due || []) {
    const { applyConciergeOrderStatus } = await import("./applyStatus.ts");
    const moved = await applyConciergeOrderStatus(sb, {
      orderId: String(task.order_id),
      status: "ready",
      notes: "Timed from the restaurant ready time",
    });
    if (moved.ok) dispatched += 1;
  }

  const { data: missing } = await sb.from("v_in_house_paid_without_task").select("order_id");
  const { ensureProcurementTask } = await import("./createTask.ts");
  for (const row of missing || []) {
    await ensureProcurementTask(sb, String(row.order_id));
    tasksCreated += 1;
  }

  await syncInHouseAccepting(sb, now);

  return { released, refunded, dispatched, warned, paged, tasksCreated, travelMinutes: TRAVEL_MINUTES, bufferMinutes: BUFFER_MINUTES };
}

async function syncInHouseAccepting(sb: Sb, now: Date) {
  const enabled = await inHouseGloballyEnabled();
  const staffed = enabled ? await deskIsStaffed(sb, now.getTime()) : false;
  const { data: merchants } = await sb.from("merchants")
    .select("id, in_house_live, is_accepting_orders")
    .eq("procurement_mode", "in_house");
  const ids = (merchants || []).map((row: { id: string }) => String(row.id));
  const { data: stores } = ids.length
    ? await sb.from("in_house_stores").select("merchant_id, offer_start_minute, offer_end_minute").in("merchant_id", ids)
    : { data: [] };
  const storeById = new Map((stores || []).map((row: { merchant_id: string }) => [String(row.merchant_id), row]));
  for (const merchant of merchants || []) {
    const store = storeById.get(String(merchant.id)) as { offer_start_minute?: number; offer_end_minute?: number } | undefined;
    const open = Boolean(
      enabled &&
      merchant.in_house_live &&
      staffed &&
      store &&
      storeOpenNow(store, now),
    );
    if (Boolean(merchant.is_accepting_orders) === open) continue;
    await sb.from("merchants").update({
      is_accepting_orders: open,
      updated_at: now.toISOString(),
    }).eq("id", merchant.id);
  }
}

export function dispatchAtFromReady(readyEtaIso: string, now = Date.now()): string {
  const ready = new Date(readyEtaIso).getTime();
  const at = ready - (TRAVEL_MINUTES + BUFFER_MINUTES) * 60 * 1000;
  return new Date(Math.max(now, at)).toISOString();
}

export { foodWasPurchased };
