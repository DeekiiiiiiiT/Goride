import { foodWasPurchased, transitionOrThrow } from "./orderStatus.ts";
import { refundMissingTask, slaLevel } from "./deskRules.ts";
import { storeOpenNow, type WeekHourRow } from "./pricing.ts";
import { deskIsStaffed, inHouseGloballyEnabled } from "./visibility.ts";

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
        await pageInHouseDesk(sb, "In-House desk: a buyer left an order while placing. Check Exceptions.");
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

  const { data: missing } = await sb.from("v_in_house_paid_without_task").select("order_id, created_at");
  const { ensureProcurementTask } = await import("./createTask.ts");
  for (const row of missing || []) {
    const result = await ensureProcurementTask(sb, String(row.order_id));
    if (result.outcome === "created") {
      tasksCreated += 1;
      continue;
    }
    if (!refundMissingTask(String(row.created_at), now, result.outcome)) continue;
    const { cancelOrder } = await import("../rushMoney/cancelOrder.ts");
    const cancelled = await cancelOrder(sb, {
      orderId: String(row.order_id),
      actor: "system",
      reason: "desk_failed",
    });
    if (cancelled.ok) {
      refunded += 1;
      await pageInHouseDesk(sb, "In-House desk: a paid order had no buyer task and was refunded.");
    }
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
  const [{ data: stores }, { data: hourRows }] = ids.length
    ? await Promise.all([
      sb.from("in_house_stores").select("merchant_id").in("merchant_id", ids),
      sb.from("merchant_hours").select("merchant_id, day_of_week, open_time, close_time, is_closed").in("merchant_id", ids),
    ])
    : [{ data: [] }, { data: [] }];
  const storeIds = new Set((stores || []).map((row: { merchant_id: string }) => String(row.merchant_id)));
  const hoursByMerchant = new Map<string, WeekHourRow[]>();
  for (const row of hourRows || []) {
    const id = String((row as { merchant_id: string }).merchant_id);
    const list = hoursByMerchant.get(id) || [];
    list.push(row as WeekHourRow);
    hoursByMerchant.set(id, list);
  }
  for (const merchant of merchants || []) {
    const id = String(merchant.id);
    const open = Boolean(
      enabled &&
      merchant.in_house_live &&
      staffed &&
      storeIds.has(id) &&
      storeOpenNow(hoursByMerchant.get(id) || [], now),
    );
    if (Boolean(merchant.is_accepting_orders) === open) continue;
    await sb.from("merchants").update({
      is_accepting_orders: open,
      updated_at: now.toISOString(),
    }).eq("id", merchant.id);
  }
}

export async function pageInHouseDesk(sb: Sb, message: string) {
  const { data } = await sb.from("in_house_alert_phones").select("phone").limit(2);
  const { sendDashText } = await import("../../_shared/dashOrderSms.ts");
  for (const row of data || []) {
    await sendDashText(String((row as { phone?: string }).phone || ""), message);
  }
}

export function dispatchAtFromReady(readyEtaIso: string, now = Date.now()): string {
  const ready = new Date(readyEtaIso).getTime();
  const at = ready - (TRAVEL_MINUTES + BUFFER_MINUTES) * 60 * 1000;
  return new Date(Math.max(now, at)).toISOString();
}

export { foodWasPurchased };
