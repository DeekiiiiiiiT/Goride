/**
 * In-House desk. Buyers place the restaurant order after the customer's card payment is captured.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRoleSet } from "../../_shared/productAdmin.ts";
import { authorizeCronOrServiceRole } from "../../_shared/authorizeCronOrServiceRole.ts";
import { detectFileMagicBytes } from "../../_shared/fileMagic.ts";
import { getFlag } from "../../_shared/featureFlags.ts";
import { scanForMalware } from "../../_shared/malwareScan.ts";
import { notifyCustomerOrderStatus } from "../../_shared/dashOrderSms.ts";
import {
  procurementCardReconLines,
  procurementPurchaseLines,
  procurementWriteoffLines,
} from "../../_shared/rushMoney/journalLines.ts";
import { postRushJournal, publicJournalClient } from "../../_shared/rushMoney/postJournal.ts";
import { ADMIN_ROLES, CONCIERGE_ROLES, OPS_ROLES, hasAnyRole } from "./access.ts";
import { cartPayload, manualChecklist } from "./adapter.ts";
import { canReplaceReceipt, partnerConversionBlocked, pickStatementTask } from "./deskRules.ts";
import { jamaicaDayStartIso, TWO_PERSON_MINOR, withinAbsorbCap } from "./pricing.ts";
import { runInHouseSweep, dispatchAtFromReady } from "./sweep.ts";
import { foodWasPurchased, transitionOrThrow } from "./orderStatus.ts";
import { applyConciergeOrderStatus } from "./applyStatus.ts";
import { retryAllowed } from "./taskMachine.ts";

// deno-lint-ignore no-explicit-any
type Sb = SupabaseClient | { from: (table: string) => any; schema?: (name: string) => any };

type Admin = { id: string; roles: string[] };

function gate(admin: Admin, allowed: Set<string>): Response | null {
  if (hasAnyRole(admin.roles, allowed)) return null;
  return new Response(JSON.stringify({ error: "You cannot do that on the In-House desk" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireDesk(c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response }, allowed: Set<string>) {
  const admin = await requireRoleSet(c, allowed);
  if (admin instanceof Response) return admin;
  const denied = gate(admin, allowed);
  if (denied) return denied;
  return admin;
}

async function logEvent(sb: Sb, taskId: string, from: string | null, to: string, actor: Admin | null, payload: Record<string, unknown>) {
  await sb.from("procurement_events").insert({
    task_id: taskId,
    from_state: from,
    to_state: to,
    actor_id: actor?.id ?? null,
    actor_type: actor ? "concierge" : "system",
    payload,
  });
}

async function updateIfState(sb: Sb, id: string, fromState: string, patch: Record<string, unknown>) {
  const { data, error } = await sb.from("procurement_tasks").update(patch).eq("id", id).eq("state", fromState).select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, conflict: true as const };
  return { ok: true as const };
}

async function purchaseJournalExists(taskId: string): Promise<boolean> {
  const { data } = await publicJournalClient().schema("rush_money").from("journals")
    .select("id")
    .eq("idempotency_key", `procure:${taskId}`)
    .maybeSingle();
  return Boolean(data?.id);
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "store";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function minuteToTime(minute: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

export function registerInHouseRoutes(app: Hono, deps: { getServiceSupabase: () => SupabaseClient }) {
  app.post("/internal/in-house/sweep", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    const summary = await runInHouseSweep(deps.getServiceSupabase());
    return c.json(summary);
  });

  app.get("/admin/in-house/queue", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data, error } = await sb.from("procurement_tasks")
      .select("id, order_id, merchant_id, state, claimed_by, pickup_code, expected_cost_minor, actual_total_minor, exception_code, sla_due_at, sla_warned_at, created_at, external_ready_eta, attempt, second_approved_at, chat_seen_at")
      .not("state", "in", "(closed,abandoned)")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const orderIds = (data || []).map((row) => String(row.order_id));
    const merchantIds = [...new Set((data || []).map((row) => String(row.merchant_id)))];
    const [{ data: orders }, { data: merchants }, { data: messages }] = await Promise.all([
      orderIds.length
        ? sb.from("orders").select("id, order_number, status, payment_status, money_state, total, items, customer_id").in("id", orderIds)
        : Promise.resolve({ data: [] }),
      merchantIds.length
        ? sb.from("merchants").select("id, name").in("id", merchantIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? publicJournalClient().from("order_messages")
          .select("order_id, created_at, sender_role")
          .in("order_id", orderIds)
          .eq("pair", "customer_merchant")
          .eq("sender_role", "customer")
        : Promise.resolve({ data: [] }),
    ]);
    const orderById = new Map((orders || []).map((row) => [String(row.id), row]));
    const merchantById = new Map((merchants || []).map((row) => [String(row.id), row]));
    const tasks = (data || []).map((task) => {
      const order = orderById.get(String(task.order_id)) as { items?: unknown[]; total?: number; order_number?: string; payment_status?: string; money_state?: string; status?: string } | undefined;
      const items = Array.isArray(order?.items) ? order.items : [];
      const seen = task.chat_seen_at ? Date.parse(String(task.chat_seen_at)) : Date.parse(String(task.created_at));
      const unreadCount = (messages || []).filter((row) => {
        return String(row.order_id) === String(task.order_id) && Date.parse(String(row.created_at)) > seen;
      }).length;
      return {
        ...task,
        storeName: (merchantById.get(String(task.merchant_id)) as { name?: string } | undefined)?.name ?? "Store",
        orderNumber: order?.order_number ?? "",
        orderStatus: order?.status ?? "",
        paymentStatus: order?.payment_status ?? "",
        moneyState: order?.money_state ?? "",
        customerTotal: order?.total ?? 0,
        itemCount: items.reduce((sum, item) => sum + Math.max(1, Number((item as { quantity?: number }).quantity) || 1), 0),
        unreadCount,
        needsApproval: Number(task.expected_cost_minor) > TWO_PERSON_MINOR && !task.second_approved_at,
      };
    });
    return c.json({ tasks });
  });

  app.post("/admin/in-house/heartbeat", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { error } = await sb.from("in_house_desk_presence").upsert({
      user_id: admin.id,
      last_seen_at: new Date().toISOString(),
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.post("/admin/in-house/tasks/:id/claim", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: busy } = await sb.from("procurement_tasks")
      .select("id")
      .eq("claimed_by", admin.id)
      .in("state", ["claimed", "placing"])
      .maybeSingle();
    if (busy) return c.json({ error: "Finish the order you already claimed" }, 409);
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    const { data: order } = await sb.from("orders").select("money_state, status").eq("id", task.order_id).maybeSingle();
    if (String(order?.money_state || "") !== "captured") {
      return c.json({ error: "The customer's payment is not captured" }, 409);
    }
    let next: string;
    try {
      next = transitionOrThrow(String(task.state), "claim");
    } catch {
      return c.json({ error: "This order cannot be claimed" }, 409);
    }
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const saved = await updateIfState(sb, task.id, String(task.state), {
      state: next,
      claimed_by: admin.id,
      claimed_at: new Date().toISOString(),
      claim_expires_at: expires,
      updated_at: new Date().toISOString(),
    });
    if (!saved.ok) {
      return c.json({ error: saved.conflict ? "Someone else took this order" : saved.error }, saved.conflict ? 409 : 500);
    }
    await logEvent(sb, task.id, task.state, next, admin, {});
    await applyConciergeOrderStatus(sb, {
      orderId: String(task.order_id),
      status: "preparing",
      actorId: admin.id,
      notes: "Restaurant is preparing the order",
    });
    return c.json({ ok: true, state: next });
  });

  app.post("/admin/in-house/tasks/:id/release", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.claimed_by && task.claimed_by !== admin.id && !hasAnyRole(admin.roles, OPS_ROLES)) {
      return c.json({ error: "Another buyer has this order" }, 403);
    }
    let next: string;
    try {
      next = transitionOrThrow(String(task.state), "release");
    } catch {
      return c.json({ error: "This order cannot be released" }, 409);
    }
    const saved = await updateIfState(sb, task.id, String(task.state), {
      state: next,
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    });
    if (!saved.ok) return c.json({ error: saved.conflict ? "Someone else took this order" : saved.error }, saved.conflict ? 409 : 500);
    await logEvent(sb, task.id, task.state, next, admin, {});
    return c.json({ ok: true });
  });

  app.post("/admin/in-house/tasks/:id/touch", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await sb.from("procurement_tasks").update({ claim_expires_at: expires, updated_at: new Date().toISOString() })
      .eq("id", c.req.param("id"))
      .eq("claimed_by", admin.id)
      .in("state", ["claimed", "placing"]);
    return c.json({ ok: true });
  });

  app.get("/admin/in-house/tasks/:id", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.state === "claimed" && task.claimed_by === admin.id) {
      const next = transitionOrThrow("claimed", "start");
      const saved = await updateIfState(sb, task.id, "claimed", { state: next, updated_at: new Date().toISOString() });
      if (saved.ok) {
        task.state = next;
        await logEvent(sb, task.id, "claimed", next, admin, {});
      }
    }
    await sb.from("procurement_tasks").update({ chat_seen_at: new Date().toISOString() }).eq("id", task.id);
    const [{ data: order }, { data: store }, { data: merchant }, { data: cards }] = await Promise.all([
      sb.from("orders").select("id, order_number, status, items, total, subtotal, delivery_fee, service_fee, money_state, payment_status, delivery_instructions").eq("id", task.order_id).maybeSingle(),
      sb.from("in_house_stores").select("*").eq("merchant_id", task.merchant_id).maybeSingle(),
      sb.from("merchants").select("id, name, phone, address").eq("id", task.merchant_id).maybeSingle(),
      sb.from("in_house_cards").select("id, label, last4, active, daily_limit_minor").eq("active", true),
    ]);
    const items = Array.isArray(order?.items) ? order.items : [];
    return c.json({
      task,
      order,
      store,
      merchant,
      cards: cards || [],
      checklist: manualChecklist({
        orderItems: items,
        pickupCode: String(task.pickup_code),
        phone: merchant?.phone,
        orderUrl: store?.order_url,
      }),
      cart: cartPayload(items),
    });
  });

  app.post("/admin/in-house/tasks/:id/receipt", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("id, state, claimed_by").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (!canReplaceReceipt(String(task.state), task.claimed_by ? String(task.claimed_by) : null, admin.id)) {
      return c.json({ error: "Only the buyer who is placing this order can change the receipt" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const raw = String(body.fileBase64 || "");
    const bytes = Uint8Array.from(atob(raw.replace(/^data:[^;]+;base64,/, "")), (ch) => ch.charCodeAt(0));
    if (!bytes.length || bytes.length > 5_000_000) return c.json({ error: "Receipt file is missing or too large" }, 400);
    const mime = detectFileMagicBytes(bytes);
    if (!mime || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) {
      return c.json({ error: "Receipt must be a photo or PDF" }, 400);
    }
    const scan = await scanForMalware(bytes);
    if (!scan.clean && scan.reason !== "scanner not configured") {
      return c.json({ error: "Receipt was rejected" }, 400);
    }
    const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1];
    const path = `${c.req.param("id")}/${crypto.randomUUID()}.${ext}`;
    const storage = publicJournalClient();
    const { error } = await storage.storage.from("in-house-receipts").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) return c.json({ error: error.message }, 500);
    const saved = await updateIfState(sb, task.id, "placing", { receipt_path: path, updated_at: new Date().toISOString() });
    if (!saved.ok) return c.json({ error: "Someone else took this order" }, 409);
    return c.json({ path, scan: scan.clean ? "clean" : "unconfigured" });
  });

  app.post("/admin/in-house/tasks/:id/approve", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("id, claimed_by, expected_cost_minor").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.claimed_by === admin.id) return c.json({ error: "A different person must approve this purchase" }, 403);
    if (Number(task.expected_cost_minor) <= TWO_PERSON_MINOR) return c.json({ ok: true, skipped: true });
    await sb.from("procurement_tasks").update({
      second_approved_by: admin.id,
      second_approved_at: new Date().toISOString(),
    }).eq("id", task.id);
    await logEvent(sb, task.id, null, "claimed", admin, { approval: "second_person" });
    return c.json({ ok: true });
  });

  app.post("/admin/in-house/tasks/:id/placed", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.claimed_by !== admin.id && task.state !== "abandoned") return c.json({ error: "Claim this order first" }, 403);
    const { data: order } = await sb.from("orders").select("id, money_state, merchant_id, status").eq("id", task.order_id).maybeSingle();
    if (String(order?.money_state || "") !== "captured") {
      return c.json({ error: "The customer's payment is not captured" }, 409);
    }
    const externalRef = String(body.externalOrderRef || "").trim();
    const actualMinor = Math.round(Number(body.actualTotalMinor));
    const cardId = String(body.cardId || "");
    const readyEta = String(body.readyEta || "");
    const receiptGct = body.receiptGctMinor == null ? null : Math.round(Number(body.receiptGctMinor));
    if (!externalRef || !Number.isFinite(actualMinor) || actualMinor <= 0 || !cardId || !task.receipt_path || !readyEta) {
      return c.json({ error: "Order number, total, card, receipt, and ready time are required" }, 400);
    }
    const { data: card } = await sb.from("in_house_cards").select("*").eq("id", cardId).eq("active", true).maybeSingle();
    if (!card) return c.json({ error: "Choose an active company card" }, 400);
    const dayStart = jamaicaDayStartIso();
    const { data: spentRows } = await sb.from("procurement_tasks")
      .select("actual_total_minor")
      .eq("card_id", cardId)
      .gte("placed_at", dayStart);
    const spent = (spentRows || []).reduce((sum, row) => sum + Number(row.actual_total_minor || 0), 0);
    if (spent + actualMinor > Number(card.daily_limit_minor)) {
      return c.json({ error: "This card is over its daily limit" }, 409);
    }
    if (Number(task.expected_cost_minor) > TWO_PERSON_MINOR && !task.second_approved_by) {
      return c.json({ error: "A second person must approve this purchase before you buy" }, 409);
    }
    const { data: store } = await sb.from("in_house_stores")
      .select("price_tolerance_bps, absorb_cap_minor, default_prep_minutes")
      .eq("merchant_id", task.merchant_id)
      .maybeSingle();
    const absorbed = withinAbsorbCap(
      Number(task.expected_cost_minor),
      actualMinor,
      Number(store?.price_tolerance_bps ?? 1000),
      Number(store?.absorb_cap_minor ?? 50000),
    );
    if (!absorbed && !task.customer_price_approved_at && task.state !== "abandoned") {
      return c.json({ error: "The price is above what Roam can absorb. Swap the item or refund the customer." }, 409);
    }
    const readyDate = new Date(readyEta);
    if (!Number.isFinite(readyDate.getTime())) return c.json({ error: "Ready time is not valid" }, 400);
    const posted = await postRushJournal(publicJournalClient(), {
      p_idempotency_key: `procure:${task.id}`,
      p_event_type: "procurement_purchase",
      p_order_id: task.order_id,
      p_correlation_id: null,
      p_lines: procurementPurchaseLines(String(task.order_id), actualMinor, String(card.last4)),
      p_actor_type: "concierge",
      p_actor_id: admin.id,
      p_reason: "Restaurant order placed",
      p_evidence: { external_order_ref: externalRef },
      p_policy_version: null,
    });
    if (!posted.ok) return c.json({ error: posted.error || "The purchase was not recorded" }, 500);
    const now = new Date().toISOString();
    const evidence = {
      external_order_ref: externalRef,
      actual_total_minor: actualMinor,
      card_id: cardId,
      receipt_gct_minor: receiptGct,
      external_ready_eta: readyDate.toISOString(),
      dispatch_at: dispatchAtFromReady(readyDate.toISOString()),
      placed_at: now,
      updated_at: now,
    };
    if (task.state === "abandoned" || String(order?.status) === "cancelled") {
      await postRushJournal(publicJournalClient(), {
        p_idempotency_key: `procure-writeoff:${task.order_id}`,
        p_event_type: "procurement_writeoff",
        p_order_id: task.order_id,
        p_correlation_id: null,
        p_lines: procurementWriteoffLines(String(task.order_id), actualMinor),
        p_actor_type: "concierge",
        p_actor_id: admin.id,
        p_reason: "Food was bought after the order was cancelled",
        p_evidence: { external_order_ref: externalRef },
        p_policy_version: null,
      });
      await sb.from("procurement_tasks").update(evidence).eq("id", task.id).eq("state", "abandoned");
      await logEvent(sb, task.id, "abandoned", "abandoned", admin, { actual_total_minor: actualMinor, writeoff: true });
      return c.json({ ok: true, state: "abandoned", writeoff: true });
    }
    let next: string;
    try {
      next = transitionOrThrow(String(task.state), "record_purchase");
    } catch {
      return c.json({ error: "This order is not ready to mark placed" }, 409);
    }
    const saved = await updateIfState(sb, task.id, String(task.state), { ...evidence, state: next });
    if (!saved.ok && saved.conflict) {
      const { data: latest } = await sb.from("procurement_tasks").select("state").eq("id", task.id).maybeSingle();
      if (latest?.state === "abandoned") {
        await postRushJournal(publicJournalClient(), {
          p_idempotency_key: `procure-writeoff:${task.order_id}`,
          p_event_type: "procurement_writeoff",
          p_order_id: task.order_id,
          p_correlation_id: null,
          p_lines: procurementWriteoffLines(String(task.order_id), actualMinor),
          p_actor_type: "concierge",
          p_actor_id: admin.id,
          p_reason: "Food was bought after the order was cancelled",
          p_evidence: { external_order_ref: externalRef },
          p_policy_version: null,
        });
        await sb.from("procurement_tasks").update(evidence).eq("id", task.id).eq("state", "abandoned");
        return c.json({ ok: true, state: "abandoned", writeoff: true });
      }
      return c.json({ error: "Someone else took this order" }, 409);
    }
    if (!saved.ok) return c.json({ error: saved.error }, 500);
    await logEvent(sb, task.id, task.state, next, admin, { actual_total_minor: actualMinor });
    return c.json({ ok: true, state: next });
  });

  app.post("/admin/in-house/tasks/:id/exception", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const code = String(body.code || "other");
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("id, state").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    let next: string;
    try {
      next = transitionOrThrow(String(task.state), "exception");
    } catch {
      return c.json({ error: "This order cannot be marked as a problem" }, 409);
    }
    const saved = await updateIfState(sb, task.id, String(task.state), {
      state: next,
      exception_code: code,
      exception_note: String(body.note || ""),
      updated_at: new Date().toISOString(),
    });
    if (!saved.ok) return c.json({ error: saved.conflict ? "Someone else took this order" : saved.error }, saved.conflict ? 409 : 500);
    await logEvent(sb, task.id, task.state, next, admin, { code });
    return c.json({ ok: true, state: next });
  });

  app.post("/admin/in-house/tasks/:id/resolve", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const action = String(body.action || "retry");
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    const machineAction = action === "price_approved"
      ? "price_approved"
      : action === "await_customer"
      ? "await_customer"
      : action === "abandon"
      ? "abandon"
      : action === "substitute"
      ? "substitute"
      : action === "wait"
      ? "wait"
      : action === "redispatch"
      ? "redispatch"
      : "retry";
    if (machineAction === "retry") {
      const bought = await purchaseJournalExists(String(task.id));
      if (!retryAllowed(String(task.state) as "exception_before_purchase", bought)) {
        return c.json({ error: "This order was already bought. It cannot be placed again." }, 409);
      }
    }
    let next: string;
    try {
      next = transitionOrThrow(String(task.state), machineAction);
    } catch {
      return c.json({ error: "That resolution is not available" }, 409);
    }
    const patch: Record<string, unknown> = { state: next, updated_at: new Date().toISOString() };
    if (machineAction === "price_approved") {
      patch.customer_price_approved_at = new Date().toISOString();
      patch.exception_code = null;
    }
    if (machineAction === "retry") {
      patch.attempt = Number(task.attempt || 1) + 1;
      patch.claimed_by = null;
      patch.exception_code = null;
    }
    if (machineAction === "substitute") patch.exception_code = null;
    const saved = await updateIfState(sb, task.id, String(task.state), patch);
    if (!saved.ok) return c.json({ error: saved.conflict ? "Someone else took this order" : saved.error }, saved.conflict ? 409 : 500);
    await logEvent(sb, task.id, task.state, next, admin, { action });
    if (machineAction === "abandon") {
      const { cancelOrder } = await import("../rushMoney/cancelOrder.ts");
      await cancelOrder(sb, { orderId: String(task.order_id), actor: "system", reason: "desk_failed", actorId: admin.id });
    }
    if (machineAction === "redispatch" || machineAction === "wait") {
      const now = new Date().toISOString();
      await sb.from("orders").update({ status: "ready", ready_at: now, updated_at: now })
        .eq("id", task.order_id)
        .in("status", ["preparing", "accepted"]);
      await notifyCustomerOrderStatus(sb, String(task.order_id), "ready");
      const { dispatchOffersForOrder } = await import("../courierConsumerRoutes.ts");
      await dispatchOffersForOrder(sb, String(task.order_id));
    }
    return c.json({ ok: true, state: next });
  });

  app.get("/admin/in-house/recon", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const names = [
      "v_in_house_placed_without_purchase_journal",
      "v_in_house_vendor_prepaid_open",
      "v_in_house_card_unmatched_7d",
      "v_in_house_merchant_payable",
      "v_in_house_variance_outliers",
      "v_in_house_paid_without_task",
    ];
    const counts: Record<string, number> = {};
    for (const name of names) {
      const { count } = await sb.from(name).select("*", { count: "exact", head: true });
      counts[name] = count || 0;
    }
    return c.json({ counts });
  });

  app.post("/admin/in-house/cards", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const last4 = String(body.last4 || "");
    if (!/^[0-9]{4}$/.test(last4)) return c.json({ error: "Enter the last 4 digits only" }, 400);
    const { data, error } = await deps.getServiceSupabase().from("in_house_cards").insert({
      label: String(body.label || `Card ${last4}`),
      last4,
      holder_user_id: body.holderUserId || null,
      daily_limit_minor: Math.round(Number(body.dailyLimitMinor || 0)),
      active: true,
    }).select("id, label, last4, daily_limit_minor, active").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ card: data });
  });

  app.get("/admin/in-house/cards", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: cards } = await sb.from("in_house_cards").select("id, label, last4, holder_user_id, daily_limit_minor, active").order("created_at");
    const start = jamaicaDayStartIso();
    const { data: spend } = await sb.from("procurement_tasks").select("card_id, actual_total_minor").gte("placed_at", start);
    const totals = new Map<string, number>();
    for (const row of spend || []) {
      const id = String(row.card_id || "");
      totals.set(id, (totals.get(id) || 0) + Number(row.actual_total_minor || 0));
    }
    return c.json({
      cards: (cards || []).map((card) => ({ ...card, spentTodayMinor: totals.get(String(card.id)) || 0 })),
    });
  });

  app.post("/admin/in-house/cards/statement-import", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const sb = deps.getServiceSupabase();
    const batchId = crypto.randomUUID();
    let imported = 0;
    let matched = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const cardId = String(line.cardId || "");
      const amount = Math.round(Number(line.amountMinor));
      const postedOn = String(line.postedOn || "");
      if (!cardId || !postedOn || !Number.isFinite(amount)) continue;
      const { data: inserted, error } = await sb.from("in_house_card_statement_lines").insert({
        card_id: cardId,
        posted_on: postedOn,
        amount_minor: amount,
        merchant_text: String(line.merchantText || ""),
        import_batch_id: batchId,
        line_no: index + 1,
      }).select("id").maybeSingle();
      if (error || !inserted) continue;
      imported += 1;
      const { data: tasks } = await sb.from("procurement_tasks")
        .select("id, claimed_by, placed_at")
        .eq("card_id", cardId)
        .eq("actual_total_minor", amount)
        .in("state", ["placed_external", "ready_for_pickup", "picked_up", "closed", "exception_after_purchase"]);
      const { data: used } = await sb.from("in_house_card_statement_lines")
        .select("task_id")
        .in("task_id", (tasks || []).map((task) => task.id).concat(["00000000-0000-0000-0000-000000000000"]));
      const usedIds = new Set((used || []).map((row) => String(row.task_id)));
      const pick = pickStatementTask(
        (tasks || []).filter((task) => task.claimed_by !== admin.id).map((task) => ({
          id: String(task.id),
          placedAt: String(task.placed_at || ""),
          matched: usedIds.has(String(task.id)),
        })),
        postedOn,
      );
      if (!pick) continue;
      await sb.from("in_house_card_statement_lines").update({
        task_id: pick.id,
        matched_by: admin.id,
        matched_at: new Date().toISOString(),
      }).eq("id", inserted.id).is("task_id", null);
      const { data: card } = await sb.from("in_house_cards").select("last4").eq("id", cardId).maybeSingle();
      await postRushJournal(publicJournalClient(), {
        p_idempotency_key: `procure-recon:${pick.id}`,
        p_event_type: "procurement_card_recon",
        p_order_id: null,
        p_correlation_id: pick.id,
        p_lines: procurementCardReconLines(amount, String(card?.last4 || "0000")),
        p_actor_type: "system",
        p_actor_id: admin.id,
        p_reason: "Card statement matched",
        p_evidence: {},
        p_policy_version: null,
      });
      matched += 1;
    }
    return c.json({ imported, matched });
  });

  app.get("/admin/in-house/markets", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const { data, error } = await deps.getServiceSupabase().from("service_markets").select("id, name, slug").eq("is_active", true).order("name");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ markets: data || [] });
  });

  app.get("/admin/in-house/stores", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: stores } = await sb.from("in_house_stores").select("*");
    const ids = (stores || []).map((row) => String(row.merchant_id));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: merchants }, { data: tasks }] = await Promise.all([
      ids.length ? sb.from("merchants").select("id, name, address, phone, lat, lng, logo_url, cover_image_url, market_id, avg_prep_time_mins, cuisine_type, procurement_mode, in_house_live, is_accepting_orders, gct_registered").in("id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("procurement_tasks").select("merchant_id, expected_cost_minor, created_at").in("merchant_id", ids).gte("created_at", since) : Promise.resolve({ data: [] }),
    ]);
    const demand = new Map<string, { orders: number; cost: number }>();
    for (const task of tasks || []) {
      const id = String(task.merchant_id);
      const current = demand.get(id) || { orders: 0, cost: 0 };
      current.orders += 1;
      current.cost += Number(task.expected_cost_minor || 0);
      demand.set(id, current);
    }
    const enabled = await getFlag("IN_HOUSE_ENABLED", false);
    return c.json({
      enabled,
      stores: (stores || []).map((store) => ({
        ...store,
        merchant: (merchants || []).find((row) => String(row.id) === String(store.merchant_id)) || null,
        demand30d: demand.get(String(store.merchant_id)) || { orders: 0, cost: 0 },
      })),
    });
  });

  app.post("/admin/in-house/stores", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const sb = deps.getServiceSupabase();
    const creating = Boolean(body.create);
    let merchantId = String(body.merchantId || "");
    if (body.live && !(await getFlag("IN_HOUSE_ENABLED", false))) {
      return c.json({ error: "The In-House switch is off. A store cannot go live yet." }, 409);
    }
    if (creating) {
      const name = String(body.name || "").trim();
      const address = String(body.address || "").trim();
      const marketId = String(body.marketId || "");
      if (!name || !address || !marketId) return c.json({ error: "Name, address, and market are required" }, 400);
      const prep = Number(body.avgPrepMinutes || body.defaultPrepMinutes || 35);
      const { data: merchant, error } = await sb.from("merchants").insert({
        owner_id: null,
        name,
        slug: slugify(name),
        description: body.description || null,
        address,
        lat: body.lat == null ? null : Number(body.lat),
        lng: body.lng == null ? null : Number(body.lng),
        phone: body.phone || body.orderPhone || null,
        logo_url: body.logoUrl || null,
        cover_image_url: body.coverImageUrl || null,
        market_id: marketId,
        cuisine_type: body.cuisineType || null,
        avg_prep_time_mins: prep,
        is_active: true,
        is_accepting_orders: false,
        gct_registered: false,
        procurement_mode: "in_house",
        in_house_live: false,
        onboarding_status: "submitted",
        operational_status: "active",
        verification_status: "approved",
        business_type: "restaurant",
        vertical_type: "restaurant",
        fulfillment_type: "cook_to_order",
      }).select("id").single();
      if (error || !merchant) return c.json({ error: error?.message || "Could not create the restaurant" }, 500);
      merchantId = String(merchant.id);
      const open = minuteToTime(Number(body.offerStartMinute ?? 660));
      const close = minuteToTime(Number(body.offerEndMinute ?? 1260));
      await sb.from("merchant_hours").insert([0, 1, 2, 3, 4, 5, 6].map((day) => ({
        merchant_id: merchantId,
        day_of_week: day,
        open_time: open,
        close_time: close,
        is_closed: false,
      })));
    } else {
      if (!merchantId) return c.json({ error: "Choose a store" }, 400);
      const { data: merchant } = await sb.from("merchants").select("id, owner_id, procurement_mode").eq("id", merchantId).maybeSingle();
      if (!merchant) return c.json({ error: "Restaurant not found" }, 404);
      if (String(merchant.procurement_mode) !== "in_house") {
        const [{ count: teamCount }, { count: openOrders }] = await Promise.all([
          sb.from("merchant_team_members").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId),
          sb.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId).not("status", "in", "(delivered,completed,cancelled)"),
        ]);
        const { data: payable } = await publicJournalClient().schema("rush_money").from("accounts")
          .select("id")
          .eq("kind", "merchant_payable")
          .eq("party_type", "merchant")
          .eq("party_id", merchantId)
          .limit(1);
        const reason = partnerConversionBlocked({
          ownerId: merchant.owner_id ? String(merchant.owner_id) : null,
          teamCount: teamCount || 0,
          payableHistory: Boolean(payable?.length),
          openOrders: openOrders || 0,
          procurementMode: String(merchant.procurement_mode || "partner"),
        });
        return c.json({ error: reason || "This restaurant cannot become In-House" }, 409);
      }
    }

    const markupBps = Number(body.markupBps ?? 1500);
    const { error } = await sb.from("in_house_stores").upsert({
      merchant_id: merchantId,
      source_brand: body.sourceBrand || body.name || null,
      source_location_label: body.sourceLocationLabel || null,
      order_channel: body.orderChannel || "web",
      order_url: body.orderUrl || null,
      order_phone: body.orderPhone || null,
      pickup_instructions: body.pickupInstructions || null,
      default_prep_minutes: Number(body.defaultPrepMinutes || 25),
      markup_bps: markupBps,
      price_tolerance_bps: Number(body.priceToleranceBps ?? 1000),
      absorb_cap_minor: Number(body.absorbCapMinor ?? 50000),
      max_order_minor: body.maxOrderMinor == null ? null : Number(body.maxOrderMinor),
      offer_start_minute: Number(body.offerStartMinute ?? 660),
      offer_end_minute: Number(body.offerEndMinute ?? 1260),
      partnership_status: body.partnershipStatus || "none",
      automation_level: "L0",
      adapter_key: "manual",
      tos_reviewed_at: body.tosReviewed ? new Date().toISOString() : null,
      tos_allows_automation: false,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return c.json({ error: error.message }, 500);
    await sb.from("merchants").update({
      procurement_mode: "in_house",
      in_house_live: Boolean(body.live),
      gct_registered: false,
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.address ? { address: String(body.address) } : {}),
      ...(body.phone ? { phone: String(body.phone) } : {}),
      ...(body.logoUrl ? { logo_url: String(body.logoUrl) } : {}),
      ...(body.coverImageUrl ? { cover_image_url: String(body.coverImageUrl) } : {}),
      ...(body.avgPrepMinutes ? { avg_prep_time_mins: Number(body.avgPrepMinutes) } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", merchantId).eq("procurement_mode", creating ? "in_house" : "in_house");
    const { data: priced } = await sb.from("menu_items").select("id, in_store_price").eq("merchant_id", merchantId);
    for (const item of priced || []) {
      if (item.in_store_price == null) continue;
      await sb.from("menu_items").update({ in_store_price: item.in_store_price }).eq("id", item.id);
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length) {
      const saved = await saveMenuItems(sb, merchantId, items);
      if (!saved.ok) return c.json({ error: saved.error }, 400);
    }
    return c.json({ ok: true, merchantId });
  });

  app.post("/admin/in-house/stores/:id/menu", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const sb = deps.getServiceSupabase();
    const merchantId = c.req.param("id");
    const now = new Date().toISOString();
    for (const item of items) {
      const id = String(item.id || "");
      if (!id) continue;
      if (item.inStorePrice == null || !Number.isFinite(Number(item.inStorePrice)) || Number(item.inStorePrice) <= 0) {
        return c.json({ error: "Every item needs the restaurant price" }, 400);
      }
      await sb.from("menu_items").update({
        in_store_price: Number(item.inStorePrice),
        source_sku: item.sourceSku || null,
        source_url: item.sourceUrl || null,
        source_price_checked_at: body.confirm ? now : item.checkedAt || now,
      }).eq("id", id).eq("merchant_id", merchantId);
    }
    const created = Array.isArray(body.create) ? body.create : [];
    if (created.length) {
      const saved = await saveMenuItems(sb, merchantId, created);
      if (!saved.ok) return c.json({ error: saved.error }, 400);
    }
    return c.json({ ok: true });
  });

  app.get("/admin/in-house/stores/:id/menu", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const { data, error } = await deps.getServiceSupabase().from("menu_items")
      .select("id, name, description, in_store_price, marketplace_price, source_sku, source_url, source_price_checked_at, is_available, category_id")
      .eq("merchant_id", c.req.param("id"))
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data || [] });
  });

  app.get("/admin/in-house/reports", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tasks } = await sb.from("procurement_tasks")
      .select("id, merchant_id, state, created_at, placed_at, claimed_at, exception_code, variance_minor, expected_cost_minor, actual_total_minor")
      .gte("created_at", since);
    const rows = tasks || [];
    const placed = rows.filter((row) => row.placed_at && row.claimed_at);
    const minutes = placed.map((row) => (new Date(String(row.placed_at)).getTime() - new Date(String(row.claimed_at)).getTime()) / 60000);
    minutes.sort((a, b) => a - b);
    const median = minutes.length ? minutes[Math.floor(minutes.length / 2)] : 0;
    const exceptions = rows.filter((row) => row.exception_code).length;
    const variance = rows.reduce((sum, row) => sum + Number(row.variance_minor || 0), 0);
    return c.json({
      orders: rows.length,
      exceptions,
      exceptionRate: rows.length ? exceptions / rows.length : 0,
      medianClaimToPlacedMinutes: median,
      varianceMinor: variance,
    });
  });
}

async function saveMenuItems(sb: Sb, merchantId: string, items: Array<Record<string, unknown>>) {
  const now = new Date().toISOString();
  const categories = new Map<string, string>();
  for (const item of items) {
    const name = String(item.name || "").trim();
    const price = Number(item.inStorePrice);
    if (!name || !Number.isFinite(price) || price <= 0) {
      return { ok: false as const, error: "Every item needs a name and the restaurant price" };
    }
    const categoryName = String(item.category || "Menu");
    let categoryId = categories.get(categoryName);
    if (!categoryId) {
      const { data: existing } = await sb.from("menu_categories").select("id").eq("merchant_id", merchantId).eq("name", categoryName).maybeSingle();
      if (existing?.id) categoryId = String(existing.id);
      else {
        const { data: created, error } = await sb.from("menu_categories").insert({
          merchant_id: merchantId,
          name: categoryName,
          is_active: true,
        }).select("id").single();
        if (error || !created) return { ok: false as const, error: error?.message || "Could not add the menu section" };
        categoryId = String(created.id);
      }
      categories.set(categoryName, categoryId);
    }
    const { error } = await sb.from("menu_items").insert({
      merchant_id: merchantId,
      category_id: categoryId,
      name,
      description: item.description || null,
      price,
      in_store_price: price,
      is_available: true,
      source_price_checked_at: now,
      source_sku: item.sourceSku || null,
    });
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

export { foodWasPurchased };
