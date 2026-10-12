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
import {
  abandonMoment,
  canReplaceReceipt,
  lastClaimer,
  partnerConversionBlocked,
  pickStatementTask,
  purchaseRecording,
  receiptFollowsAbandon,
} from "./deskRules.ts";
import { customerPriceFromCost, jamaicaDayStartIso, TWO_PERSON_MINOR, weekOfferWindow, withinAbsorbCap } from "./pricing.ts";
import { listChoiceLists, saveChoiceList, stampSectionChoiceLists } from "../menuChoiceLibrary.ts";
import { cheapestPizzaPrice, parsePizzaMenu, parsePizzaRecipe, validatePizzaMenu } from "../../../../packages/merchant-ops/src/pizzaMenu.ts";
import { runInHouseSweep, dispatchAtFromReady } from "./sweep.ts";
import { foodWasPurchased, transitionOrThrow } from "./orderStatus.ts";
import { applyConciergeOrderStatus } from "./applyStatus.ts";
import { retryAllowed } from "./taskMachine.ts";

// deno-lint-ignore no-explicit-any
type Sb = SupabaseClient | { from: (table: string) => any; schema?: (name: string) => any };

type Admin = { id: string; roles: string[]; email?: string };

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
    payload: { ...payload, ...(actor?.email ? { actor_email: actor.email } : {}) },
  });
}

async function taskEvents(sb: Sb, taskId: string) {
  const { data, error } = await sb.from("procurement_events")
    .select("to_state, actor_id, payload, at")
    .eq("task_id", taskId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, events: data || [] };
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

type DayInput = { dayOfWeek: number; open: string; close: string; isClosed: boolean };

function normalizeWeek(raw: unknown): DayInput[] | null {
  if (!Array.isArray(raw)) return null;
  const byDay = new Map<number, DayInput>();
  for (const entry of raw) {
    const row = entry as { dayOfWeek?: number; day_of_week?: number; open?: string; close?: string; isClosed?: boolean; is_closed?: boolean };
    const day = Number(row.dayOfWeek ?? row.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    byDay.set(day, {
      dayOfWeek: day,
      open: String(row.open || "11:00").slice(0, 5),
      close: String(row.close || "21:00").slice(0, 5),
      isClosed: Boolean(row.isClosed ?? row.is_closed),
    });
  }
  if (!byDay.size) return null;
  return [0, 1, 2, 3, 4, 5, 6].map((day) => byDay.get(day) || { dayOfWeek: day, open: "11:00", close: "21:00", isClosed: false });
}

function defaultWeek(): DayInput[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({ dayOfWeek: day, open: "11:00", close: "21:00", isClosed: false }));
}

async function saveWeek(sb: Sb, merchantId: string, week: DayInput[]) {
  await sb.from("merchant_hours").delete().eq("merchant_id", merchantId);
  const { error } = await sb.from("merchant_hours").insert(week.map((day) => ({
    merchant_id: merchantId,
    day_of_week: day.dayOfWeek,
    open_time: minuteToTime(Number(day.open.slice(0, 2)) * 60 + Number(day.open.slice(3, 5))),
    close_time: minuteToTime(Number(day.close.slice(0, 2)) * 60 + Number(day.close.slice(3, 5))),
    is_closed: day.isClosed,
  })));
  return error;
}

function pricedOptions(options: unknown, markupBps: number) {
  if (!Array.isArray(options)) return [];
  return options.map((group) => {
    const row = group as Record<string, unknown>;
    const nested = Array.isArray(row.options) ? row.options : [];
    const name = String(row.name || row.title || "Options");
    const maxRaw = Number(row.maxSelections);
    const maxSelections = Number.isFinite(maxRaw) ? maxRaw : (row.required ? 1 : 0);
    return {
      id: String(row.id || crypto.randomUUID()),
      name,
      title: String(row.title || name),
      kind: row.kind === "included" || row.kind === "extra" || row.kind === "priced" ? row.kind : undefined,
      ...(row.kind === "priced" || row.priceMode === "replace" ? { priceMode: "replace" } : {}),
      required: Boolean(row.required),
      minSelections: row.required ? 1 : 0,
      maxSelections,
      ...(row.libraryGroupId ? { libraryGroupId: String(row.libraryGroupId) } : {}),
      options: nested.map((option) => {
        const item = option as Record<string, unknown>;
        const extra = Math.max(0, Number(item.priceAdjustment) || 0);
        const label = String(item.name || item.label || "Option");
        return {
          id: String(item.id || crypto.randomUUID()),
          name: label,
          label,
          priceAdjustment: extra,
          marketplaceAdjustment: customerPriceFromCost(extra, markupBps),
          isAvailable: item.isAvailable !== false,
        };
      }),
    };
  });
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
      .select("id, order_id, merchant_id, state, claimed_by, pickup_code, expected_cost_minor, actual_total_minor, exception_code, sla_due_at, sla_warned_at, sla_paged_at, created_at, external_ready_eta, attempt, second_approved_at, chat_seen_at")
      .not("state", "in", "(closed,abandoned)")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const taskIds = (data || []).map((row) => String(row.id));
    const orderIds = (data || []).map((row) => String(row.order_id));
    const merchantIds = [...new Set((data || []).map((row) => String(row.merchant_id)))];
    const [{ data: orders }, { data: merchants }, { data: messages }, claimEventsResult] = await Promise.all([
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
      taskIds.length
        ? sb.from("procurement_events").select("task_id, to_state, actor_id, payload, at").in("task_id", taskIds).in("to_state", ["claimed", "placing"])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (claimEventsResult.error) return c.json({ error: claimEventsResult.error.message }, 500);
    const orderById = new Map((orders || []).map((row) => [String(row.id), row]));
    const merchantById = new Map((merchants || []).map((row) => [String(row.id), row]));
    const eventsByTask = new Map<string, Array<{ to_state?: string; actor_id?: string; payload?: { actor_email?: string }; at?: string }>>();
    for (const event of claimEventsResult.data || []) {
      const id = String(event.task_id);
      const list = eventsByTask.get(id) || [];
      list.push(event);
      eventsByTask.set(id, list);
    }
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
        itemCount: items.reduce((sum: number, item) => sum + Math.max(1, Number((item as { quantity?: number }).quantity) || 1), 0),
        buyerName: lastClaimer(eventsByTask.get(String(task.id)) || [])?.email || null,
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

  app.get("/admin/in-house/audience", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const [{ data: customers }, { data: phones }] = await Promise.all([
      sb.from("in_house_beta_customers").select("customer_id, email, added_at").order("added_at"),
      sb.from("in_house_alert_phones").select("phone").order("phone"),
    ]);
    return c.json({ customers: customers || [], phones: (phones || []).map((row) => String(row.phone)) });
  });

  app.post("/admin/in-house/audience", async (c) => {
    const admin = await requireDesk(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const sb = deps.getServiceSupabase();
    if (Array.isArray(body.phones)) {
      const phones = [...new Set(body.phones.map((phone: unknown) => String(phone || "").trim()).filter(Boolean))].slice(0, 2);
      await sb.from("in_house_alert_phones").delete().neq("phone", "");
      if (phones.length) {
        const { error } = await sb.from("in_house_alert_phones").insert(phones.map((phone) => ({ phone })));
        if (error) return c.json({ error: error.message }, 500);
      }
      return c.json({ ok: true, phones });
    }
    if (body.remove && body.customerId) {
      await sb.from("in_house_beta_customers").delete().eq("customer_id", String(body.customerId));
      return c.json({ ok: true });
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return c.json({ error: "Enter the customer's email" }, 400);
    const { data: customer } = await sb.from("customers").select("id, email").ilike("email", email).maybeSingle();
    if (!customer?.id) return c.json({ error: "No customer account uses that email" }, 404);
    const { error } = await sb.from("in_house_beta_customers").upsert({
      customer_id: customer.id,
      email: String(customer.email || email),
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, customerId: customer.id });
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
    const loaded = await taskEvents(sb, task.id);
    if (!loaded.ok) return c.json({ error: loaded.error }, 500);
    const events = loaded.events;
    const claimer = lastClaimer(events);
    if (!canReplaceReceipt({
      state: String(task.state),
      claimedBy: task.claimed_by ? String(task.claimed_by) : null,
      actorId: admin.id,
      lastClaimerId: claimer?.id || null,
      isOps: hasAnyRole(admin.roles, OPS_ROLES),
    })) {
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
    const now = new Date().toISOString();
    const saved = await updateIfState(sb, task.id, String(task.state), {
      receipt_path: path,
      receipt_uploaded_at: now,
      updated_at: now,
    });
    if (!saved.ok) return c.json({ error: "Someone else took this order" }, 409);
    return c.json({ path, scan: scan.clean ? "clean" : "unconfigured" });
  });

  app.post("/admin/in-house/tasks/:id/approve", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("id, state, claimed_by, expected_cost_minor").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.claimed_by === admin.id) return c.json({ error: "A different person must approve this purchase" }, 403);
    if (Number(task.expected_cost_minor) <= TWO_PERSON_MINOR) return c.json({ ok: true, skipped: true });
    await sb.from("procurement_tasks").update({
      second_approved_by: admin.id,
      second_approved_at: new Date().toISOString(),
    }).eq("id", task.id);
    await logEvent(sb, task.id, String(task.state), String(task.state), admin, { approval: "second_person" });
    return c.json({ ok: true });
  });

  app.post("/admin/in-house/tasks/:id/placed", async (c) => {
    const admin = await requireDesk(c, CONCIERGE_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const sb = deps.getServiceSupabase();
    const { data: task } = await sb.from("procurement_tasks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!task) return c.json({ error: "Task not found" }, 404);
    const loaded = await taskEvents(sb, task.id);
    if (!loaded.ok) return c.json({ error: loaded.error }, 500);
    const events = loaded.events;
    const claimer = lastClaimer(events);
    const recording = purchaseRecording({
      state: String(task.state),
      actorId: admin.id,
      claimedBy: task.claimed_by ? String(task.claimed_by) : null,
      lastClaimerId: claimer?.id || null,
      isOps: hasAnyRole(admin.roles, OPS_ROLES),
    });
    if (recording === "denied") return c.json({ error: "Claim this order first" }, 403);
    if (String(task.state) === "abandoned" && !receiptFollowsAbandon(task.receipt_uploaded_at, abandonMoment(events))) {
      return c.json({ error: "Upload the receipt after this order was abandoned" }, 400);
    }
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
    const writeoff = recording === "writeoff" || String(order?.status) === "cancelled";
    if (!writeoff && Number(task.expected_cost_minor) > TWO_PERSON_MINOR && !task.second_approved_by) {
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
    if (!writeoff && !absorbed && !task.customer_price_approved_at) {
      return c.json({ error: "The price is above what Roam can absorb. Swap the item or refund the customer." }, 409);
    }
    const readyDate = new Date(readyEta);
    if (!Number.isFinite(readyDate.getTime())) return c.json({ error: "Ready time is not valid" }, 400);
    const movedOn = writeoff && String(task.state) !== "abandoned" && String(order?.status) !== "cancelled";
    const purchaseKey = movedOn ? `procure-late:${task.id}:${admin.id}` : `procure:${task.id}`;
    const writeoffKey = movedOn ? `procure-writeoff-late:${task.id}:${admin.id}` : `procure-writeoff:${task.order_id}`;
    const posted = await postRushJournal(publicJournalClient(), {
      p_idempotency_key: purchaseKey,
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
    if (writeoff) {
      await postRushJournal(publicJournalClient(), {
        p_idempotency_key: writeoffKey,
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
      await sb.from("procurement_tasks").update(evidence).eq("id", task.id).eq("state", String(task.state));
      await logEvent(sb, task.id, String(task.state), String(task.state), admin, { actual_total_minor: actualMinor, writeoff: true });
      return c.json({ ok: true, state: task.state, writeoff: true });
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
    const confirmedNothingBought = body.confirmedNothingBought === true;
    if (machineAction === "retry") {
      const bought = await purchaseJournalExists(String(task.id));
      if (!retryAllowed(String(task.state) as "exception_before_purchase", bought, confirmedNothingBought)) {
        return c.json({ error: "Confirm with the buyer that nothing was bought before trying again." }, 409);
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
    let claimer: { id: string; email: string | null } | null = null;
    if (machineAction === "retry") {
      const loaded = await taskEvents(sb, task.id);
      if (!loaded.ok) return c.json({ error: loaded.error }, 500);
      claimer = lastClaimer(loaded.events);
    }
    const saved = await updateIfState(sb, task.id, String(task.state), patch);
    if (!saved.ok) return c.json({ error: saved.conflict ? "Someone else took this order" : saved.error }, saved.conflict ? 409 : 500);
    await logEvent(sb, task.id, task.state, next, admin, {
      action,
      ...(confirmedNothingBought ? { confirmed_nothing_bought: true, buyer: claimer?.email || claimer?.id || null } : {}),
    });
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
    const [{ data: merchants }, { data: tasks }, { data: hours }] = await Promise.all([
      ids.length ? sb.from("merchants").select("id, name, address, phone, lat, lng, logo_url, cover_image_url, market_id, avg_prep_time_mins, cuisine_type, procurement_mode, in_house_live, is_accepting_orders, gct_registered").in("id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("procurement_tasks").select("merchant_id, expected_cost_minor, created_at").in("merchant_id", ids).gte("created_at", since) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("merchant_hours").select("merchant_id, day_of_week, open_time, close_time, is_closed").in("merchant_id", ids).order("day_of_week") : Promise.resolve({ data: [] }),
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
        hours: (hours || []).filter((row) => String(row.merchant_id) === String(store.merchant_id)),
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
        submitted_at: new Date().toISOString(),
        operational_status: "active",
        verification_status: "approved",
        business_type: "restaurant",
        vertical_type: "restaurant",
        fulfillment_type: "cook_to_order",
      }).select("id").single();
      if (error || !merchant) return c.json({ error: error?.message || "Could not create the restaurant" }, 500);
      merchantId = String(merchant.id);
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

    const week = normalizeWeek(body.hours) || (creating ? defaultWeek() : null);
    if (week) {
      const hoursError = await saveWeek(sb, merchantId, week);
      if (hoursError) return c.json({ error: hoursError.message }, 500);
    }
    const window = week ? weekOfferWindow(week) : null;
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
      ...(window ? { offer_start_minute: window.start, offer_end_minute: window.end } : {}),
      partnership_status: body.partnershipStatus || "none",
      automation_level: "L0",
      adapter_key: "manual",
      tos_reviewed_at: body.tosReviewed ? new Date().toISOString() : null,
      tos_allows_automation: false,
      notes: body.notes || null,
      ...(body.audience === "public" || body.audience === "beta" ? { audience: body.audience } : {}),
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
      ...(body.cuisineType != null ? { cuisine_type: String(body.cuisineType) } : {}),
      ...(body.marketId ? { market_id: String(body.marketId) } : {}),
      ...(body.lat != null && body.lat !== "" ? { lat: Number(body.lat) } : {}),
      ...(body.lng != null && body.lng !== "" ? { lng: Number(body.lng) } : {}),
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
    if (body.markupBps != null) {
      const { data: optionRows } = await sb.from("menu_items").select("id, options").eq("merchant_id", merchantId);
      for (const row of optionRows || []) {
        if (!Array.isArray(row.options) || row.options.length === 0) continue;
        await sb.from("menu_items").update({
          options: pricedOptions(row.options, Number(body.markupBps)),
        }).eq("id", row.id);
      }
    }
    return c.json({ ok: true, merchantId });
  });

  app.get("/admin/in-house/stores/:id/choice-lists", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const result = await listChoiceLists(deps.getServiceSupabase(), c.req.param("id"));
    if (!result.ok) return c.json({ error: result.error }, 500);
    return c.json({ lists: result.lists });
  });

  app.post("/admin/in-house/stores/:id/choice-lists", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const saved = await saveChoiceList(deps.getServiceSupabase(), c.req.param("id"), body, body.id ? String(body.id) : undefined);
    if (!saved.ok) return c.json({ error: saved.error }, saved.status);
    return c.json({ list: saved.list });
  });

  app.post("/admin/in-house/stores/:id/menu", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const sb = deps.getServiceSupabase();
    const merchantId = c.req.param("id");
    const now = new Date().toISOString();
    const { data: storeRow } = await sb.from("in_house_stores").select("markup_bps").eq("merchant_id", merchantId).maybeSingle();
    const markupBps = Number(storeRow?.markup_bps ?? 1500);
    const categories = Array.isArray(body.categories) ? body.categories : [];
    const stampIds = new Set<string>();
    for (const category of categories) {
      const name = String(category.name || "").trim();
      if (category.remove && category.id) {
        const categoryId = String(category.id);
        const { data: dishes } = await sb.from("menu_items").select("id").eq("merchant_id", merchantId).eq("category_id", categoryId).limit(1);
        if (dishes?.length) return c.json({ error: "Move the dishes out of this section before removing it" }, 400);
        await sb.from("menu_categories").update({ is_active: false }).eq("id", categoryId).eq("merchant_id", merchantId);
        continue;
      }
      if (category.id && Array.isArray(category.choiceListIds)) {
        await sb.from("menu_categories").update({ choice_list_ids: category.choiceListIds }).eq("id", String(category.id)).eq("merchant_id", merchantId);
        stampIds.add(String(category.id));
      }
      if (category.id && category.pizzaMenu) {
        const priced = await savePizzaMenu(sb, merchantId, String(category.id), category.pizzaMenu);
        if (!priced.ok) return c.json({ error: priced.error }, 400);
      }
      if (!name) continue;
      if (category.id) {
        await sb.from("menu_categories").update({ name }).eq("id", String(category.id)).eq("merchant_id", merchantId);
      } else {
        const { data: existingSection } = await sb.from("menu_categories").select("id").eq("merchant_id", merchantId).eq("name", name).eq("is_active", true).limit(1);
        if (!existingSection?.length) {
          await sb.from("menu_categories").insert({ merchant_id: merchantId, name, is_active: true });
        }
      }
    }
    for (const item of items) {
      const id = String(item.id || "");
      if (!id) continue;
      const fullDish = Boolean(String(item.name || "").trim());
      const drink = /drink/i.test(String(item.category || ""));
      const pizza = /pizza/i.test(String(item.category || ""));
      const prep = Math.round(Number(item.prepMinutes));
      if (fullDish && !drink && (!Number.isFinite(prep) || prep <= 0)) {
        return c.json({ error: "Every dish needs how many minutes it takes" }, 400);
      }
      const baked = pizza && item.pizzaRecipe
        ? await pizzaDishPrice(sb, merchantId, String(item.categoryId || ""), item.pizzaRecipe)
        : null;
      if (baked && !baked.ok) return c.json({ error: baked.error }, 400);
      const restaurantPrice = baked?.ok ? baked.price : Number(item.inStorePrice);
      if (restaurantPrice == null || !Number.isFinite(restaurantPrice) || restaurantPrice <= 0) {
        return c.json({ error: "Every item needs the restaurant price" }, 400);
      }
      await sb.from("menu_items").update({
        in_store_price: restaurantPrice,
        ...(item.sourceSku != null ? { source_sku: item.sourceSku || null } : {}),
        ...(item.sourceUrl != null ? { source_url: item.sourceUrl || null } : {}),
        source_price_checked_at: body.confirm ? now : item.checkedAt || now,
        ...(fullDish ? {
          name: String(item.name),
          description: item.description || null,
          image_url: item.imageUrl || null,
          options: pricedOptions(item.options, markupBps),
          is_available: item.isAvailable !== false,
          prep_time_mins: drink ? null : prep,
          ...(baked?.ok ? { pizza_recipe: baked.recipe } : {}),
          ...(item.categoryId ? { category_id: String(item.categoryId) } : {}),
        } : {}),
      }).eq("id", id).eq("merchant_id", merchantId);
    }
    const created = Array.isArray(body.create) ? body.create : [];
    if (created.length) {
      const saved = await saveMenuItems(sb, merchantId, created);
      if (!saved.ok) return c.json({ error: saved.error }, 400);
    }
    const touched = new Set<string>(stampIds);
    for (const item of [...items, ...created]) {
      if (item.categoryId) touched.add(String(item.categoryId));
    }
    for (const categoryId of touched) {
      if (!stampIds.has(categoryId)) {
        const { data: row } = await sb.from("menu_categories").select("choice_list_ids").eq("id", categoryId).eq("merchant_id", merchantId).maybeSingle();
        const ids = Array.isArray(row?.choice_list_ids) ? row.choice_list_ids : [];
        if (!ids.length) continue;
      }
      await stampSectionChoiceLists(sb, merchantId, categoryId);
    }
    return c.json({ ok: true });
  });

  app.get("/admin/in-house/stores/:id/menu", async (c) => {
    const admin = await requireDesk(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const merchantId = c.req.param("id");
    const sb = deps.getServiceSupabase();
    const [{ data, error }, { data: categories }] = await Promise.all([
      sb.from("menu_items")
        .select("id, name, description, image_url, in_store_price, marketplace_price, options, source_sku, source_url, source_price_checked_at, is_available, category_id, prep_time_mins, pizza_recipe")
        .eq("merchant_id", merchantId)
        .order("name"),
      sb.from("menu_categories").select("id, name, choice_list_ids, pizza_menu").eq("merchant_id", merchantId).eq("is_active", true).order("name"),
    ]);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data || [], categories: categories || [] });
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

async function savePizzaMenu(sb: Sb, merchantId: string, categoryId: string, raw: unknown) {
  const menu = parsePizzaMenu(raw);
  if (!menu) return { ok: false as const, error: "The pizza prices are incomplete" };
  const invalid = validatePizzaMenu(menu);
  if (invalid) return { ok: false as const, error: invalid };
  const { error } = await sb.from("menu_categories").update({ pizza_menu: menu }).eq("id", categoryId).eq("merchant_id", merchantId);
  if (error) return { ok: false as const, error: error.message };
  const { data: items } = await sb.from("menu_items").select("id, pizza_recipe").eq("merchant_id", merchantId).eq("category_id", categoryId);
  for (const item of items || []) {
    const recipe = parsePizzaRecipe(item.pizza_recipe);
    if (!recipe) continue;
    const price = cheapestPizzaPrice(menu, recipe);
    if (price == null) return { ok: false as const, error: "A pizza uses a crust that is not sold on any size" };
    const { error: priceError } = await sb.from("menu_items").update({ in_store_price: price }).eq("id", item.id);
    if (priceError) return { ok: false as const, error: priceError.message };
  }
  return { ok: true as const };
}

async function pizzaDishPrice(sb: Sb, merchantId: string, categoryId: string, raw: unknown) {
  const recipe = parsePizzaRecipe(raw);
  if (!recipe) return { ok: false as const, error: "This pizza needs a crust, sauce, and cheese amount" };
  const { data } = await sb.from("menu_categories").select("pizza_menu").eq("id", categoryId).eq("merchant_id", merchantId).maybeSingle();
  const menu = parsePizzaMenu(data?.pizza_menu);
  if (!menu) return { ok: false as const, error: "Save the pizza prices before saving this pizza" };
  const price = cheapestPizzaPrice(menu, recipe);
  if (price == null) return { ok: false as const, error: "That crust is not sold on a size" };
  return { ok: true as const, price, recipe };
}

async function sectionForNewDish(
  sb: Sb,
  merchantId: string,
  item: Record<string, unknown>,
  cache: Map<string, string>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const chosen = String(item.categoryId || "").trim();
  if (chosen) return { ok: true, id: chosen };
  const categoryName = String(item.category || "Menu").trim() || "Menu";
  const cached = cache.get(categoryName);
  if (cached) return { ok: true, id: cached };
  const { data: existing } = await sb.from("menu_categories").select("id").eq("merchant_id", merchantId).eq("name", categoryName).eq("is_active", true).limit(1);
  const found = existing?.[0]?.id ? String(existing[0].id) : "";
  if (found) {
    cache.set(categoryName, found);
    return { ok: true, id: found };
  }
  const { data: created, error } = await sb.from("menu_categories").insert({
    merchant_id: merchantId,
    name: categoryName,
    is_active: true,
  }).select("id").single();
  if (error || !created) return { ok: false, error: error?.message || "Could not add the menu section" };
  const id = String(created.id);
  cache.set(categoryName, id);
  return { ok: true, id };
}

async function saveMenuItems(sb: Sb, merchantId: string, items: Array<Record<string, unknown>>) {
  const now = new Date().toISOString();
  const { data: storeRow } = await sb.from("in_house_stores").select("markup_bps").eq("merchant_id", merchantId).maybeSingle();
  const markupBps = Number(storeRow?.markup_bps ?? 1500);
  const categories = new Map<string, string>();
  for (const item of items) {
    const name = String(item.name || "").trim();
    const price = Number(item.inStorePrice);
    const drink = /drink/i.test(String(item.category || ""));
    const pizza = /pizza/i.test(String(item.category || ""));
    const prep = Math.round(Number(item.prepMinutes));
    if (!name || (!pizza && (!Number.isFinite(price) || price <= 0))) {
      return { ok: false as const, error: "Every item needs a name and the restaurant price" };
    }
    if (!drink && (!Number.isFinite(prep) || prep <= 0)) {
      return { ok: false as const, error: "Every dish needs how many minutes it takes" };
    }
    const categoryId = await sectionForNewDish(sb, merchantId, item, categories);
    if (!categoryId.ok) return categoryId;
    const baked = pizza && item.pizzaRecipe
      ? await pizzaDishPrice(sb, merchantId, categoryId.id, item.pizzaRecipe)
      : null;
    if (baked && !baked.ok) return baked;
    const restaurantPrice = baked?.ok ? baked.price : price;
    if (!Number.isFinite(restaurantPrice) || restaurantPrice <= 0) {
      return { ok: false as const, error: "Every item needs a name and the restaurant price" };
    }
    const { error } = await sb.from("menu_items").insert({
      merchant_id: merchantId,
      category_id: categoryId.id,
      name,
      description: item.description || null,
      image_url: item.imageUrl || null,
      options: pricedOptions(item.options, markupBps),
      price: restaurantPrice,
      in_store_price: restaurantPrice,
      is_available: item.isAvailable !== false,
      prep_time_mins: drink ? null : prep,
      ...(baked?.ok ? { pizza_recipe: baked.recipe } : {}),
      source_price_checked_at: now,
      source_sku: item.sourceSku || null,
    });
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

export { foodWasPurchased };
