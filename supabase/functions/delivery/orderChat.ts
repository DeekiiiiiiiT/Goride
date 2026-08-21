/**
 * Rush order chat routes — mirror rides/rideChat.ts.
 * Writes: service role only. Reads: RLS + edge access checks.
 */
import type { Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFlag } from "../_shared/featureFlags.ts";
import {
  requireMerchantPermission,
  resolveMerchantAccess,
  type MerchantMembership,
} from "./merchantAuth.ts";
import {
  assertOrderChatAccess,
  ORDER_CHAT_PAIR_FLAGS,
  parseOrderChatPair,
  type OrderChatOrderProps,
  type OrderChatPair,
  type OrderChatSenderRole,
  type OrderChatViewerRole,
} from "./orderChatAccess.ts";
import { notifyOrderChatRecipients } from "./orderChatNotify.ts";

const MAX_BODY_LEN = 500;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX = 20;

const rateBuckets = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const key = userId;
  const prev = rateBuckets.get(key) ?? [];
  const recent = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

export type OrderMessageDto = {
  id: string;
  order_id: string;
  pair: OrderChatPair;
  sender_user_id: string | null;
  sender_role: OrderChatSenderRole;
  body: string;
  quick_reply_key: string | null;
  courier_user_id: string | null;
  created_at: string;
};

export function toOrderMessageDto(row: Record<string, unknown>): OrderMessageDto {
  const pair = parseOrderChatPair(String(row.pair ?? "")) ?? "customer_courier";
  const roleRaw = String(row.sender_role ?? "customer");
  const senderRole: OrderChatSenderRole =
    roleRaw === "merchant" || roleRaw === "courier" || roleRaw === "support" || roleRaw === "system"
      ? roleRaw
      : "customer";
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    pair,
    sender_user_id: row.sender_user_id != null ? String(row.sender_user_id) : null,
    sender_role: senderRole,
    body: String(row.body ?? ""),
    quick_reply_key: row.quick_reply_key != null ? String(row.quick_reply_key) : null,
    courier_user_id: row.courier_user_id != null ? String(row.courier_user_id) : null,
    created_at: String(row.created_at),
  };
}

type OrderChatDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
  /** Public-schema service client for order_messages */
  getPublicServiceSupabase: () => SupabaseClient;
};

async function requireAuthUser(
  deps: OrderChatDeps,
  authHeader: string | undefined,
): Promise<{ user: { id: string; email?: string } } | { error: string; status: 401 }> {
  if (!authHeader) return { error: "Unauthorized", status: 401 };
  const supabase = deps.getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  return { user: { id: user.id, email: user.email } };
}

async function loadOrderForChat(
  serviceSb: SupabaseClient,
  orderId: string,
): Promise<(OrderChatOrderProps & {
  order_number?: string | null;
  merchant_id: string;
  customer_user_id: string | null;
}) | null> {
  const { data, error } = await serviceSb
    .from("orders")
    .select(`
      id, status, customer_id, merchant_id, courier_id,
      picked_up_at, delivered_at, cancelled_at, updated_at, order_number,
      customer:customers!orders_customer_id_fkey(user_id)
    `)
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const customer = row.customer as { user_id?: string } | null;
  return {
    id: String(row.id),
    status: String(row.status ?? ""),
    customer_id: row.customer_id != null ? String(row.customer_id) : null,
    merchant_id: String(row.merchant_id),
    courier_id: row.courier_id != null ? String(row.courier_id) : null,
    customer_user_id: customer?.user_id ? String(customer.user_id) : null,
    picked_up_at: row.picked_up_at != null ? String(row.picked_up_at) : null,
    delivered_at: row.delivered_at != null ? String(row.delivered_at) : null,
    cancelled_at: row.cancelled_at != null ? String(row.cancelled_at) : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
    order_number: row.order_number != null ? String(row.order_number) : null,
  };
}

async function resolveViewerRole(
  order: OrderChatOrderProps & { customer_user_id: string | null; merchant_id: string },
  userId: string,
  userEmail?: string | null,
): Promise<{ role: OrderChatViewerRole | null; membership: MerchantMembership | null }> {
  if (order.customer_user_id && order.customer_user_id === userId) {
    return { role: "customer", membership: null };
  }
  if (order.courier_id && String(order.courier_id) === userId) {
    return { role: "courier", membership: null };
  }
  const resolved = await resolveMerchantAccess(userId, userEmail);
  if (
    resolved &&
    String(resolved.merchant.id) === String(order.merchant_id) &&
    requireMerchantPermission(resolved.membership, "orders")
  ) {
    return { role: "merchant", membership: resolved.membership };
  }
  return { role: null, membership: null };
}

async function isPairFlagEnabled(pair: OrderChatPair): Promise<boolean> {
  if (pair === "support") return true;
  const flagName = ORDER_CHAT_PAIR_FLAGS[pair];
  // Default on; set FEATURE_ORDER_CHAT_*=0 to kill a pair without deploy.
  return await getFlag(flagName, true);
}

async function auditOrderChat(
  serviceSb: SupabaseClient,
  orderId: string,
  actorId: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await serviceSb.from("order_events").insert({
      order_id: orderId,
      status: eventType,
      actor_type: "system",
      actor_id: actorId ?? null,
      notes: JSON.stringify(payload).slice(0, 2000),
    });
  } catch (e) {
    console.warn("[orderChat] audit failed", e);
  }
}

/** Insert system notice into courier-facing pairs when courier is freed/reassigned. */
export async function insertCourierReassignedSystemMessages(
  publicSb: SupabaseClient,
  orderId: string,
  previousCourierUserId: string | null,
): Promise<void> {
  if (!previousCourierUserId) return;
  const body = "Courier reassigned — this chat thread is closed for the previous courier.";
  const pairs: OrderChatPair[] = ["customer_courier", "merchant_courier"];
  for (const pair of pairs) {
    await publicSb.from("order_messages").insert({
      order_id: orderId,
      pair,
      sender_user_id: null,
      sender_role: "system",
      body,
      quick_reply_key: "system.courier_reassigned",
      courier_user_id: previousCourierUserId,
    });
  }
}

export function registerOrderChatRoutes(app: Hono, deps: OrderChatDeps) {
  app.get("/orders/:id/messages", async (c: Context) => {
    const auth = await requireAuthUser(deps, c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const orderId = c.req.param("id");
    const pair = parseOrderChatPair(c.req.query("pair") ?? "customer_courier");
    if (!pair) return c.json({ error: "invalid_pair" }, 400);

    const serviceSb = deps.getServiceSupabase();
    const order = await loadOrderForChat(serviceSb, orderId);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { role } = await resolveViewerRole(order, auth.user.id, auth.user.email);
    if (!role) return c.json({ error: "forbidden" }, 403);

    const pairEnabled = await isPairFlagEnabled(pair);
    const access = assertOrderChatAccess({
      order,
      pair,
      userId: auth.user.id,
      viewerRole: role,
      requireOpen: false,
      pairEnabled,
    });
    if (!access.ok) {
      return c.json({ error: access.error, message: access.message }, access.status);
    }

    const limitRaw = Number(c.req.query("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
      : DEFAULT_LIMIT;
    const before = c.req.query("before")?.trim();

    let query = deps.getPublicServiceSupabase()
      .from("order_messages")
      .select(
        "id, order_id, pair, sender_user_id, sender_role, body, quick_reply_key, courier_user_id, created_at",
      )
      .eq("order_id", orderId)
      .eq("pair", pair)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (role === "courier") {
      query = query.eq("courier_user_id", auth.user.id);
    } else if (pair === "customer_courier" || pair === "merchant_courier") {
      // Customer/merchant see current assignment thread; include null courier only for support/system edge cases
      if (order.courier_id) {
        query = query.eq("courier_user_id", order.courier_id);
      }
    }

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) {
      return c.json({ error: "fetch_failed", message: error.message }, 500);
    }

    const messages = (data ?? [])
      .map((row) => toOrderMessageDto(row as Record<string, unknown>))
      .reverse();

    const writeAccess = assertOrderChatAccess({
      order,
      pair,
      userId: auth.user.id,
      viewerRole: role,
      requireOpen: true,
      pairEnabled,
    });

    return c.json({
      messages,
      viewer_role: role,
      pair,
      chat_open: writeAccess.ok && writeAccess.chatOpen,
      participants: {
        customer: { user_id: order.customer_user_id, label: "Customer" },
        merchant: { user_id: null, label: "Restaurant" },
        courier: {
          user_id: order.courier_id,
          label: "Courier",
        },
      },
    });
  });

  app.post("/orders/:id/messages", async (c: Context) => {
    const auth = await requireAuthUser(deps, c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    if (!checkRateLimit(auth.user.id)) {
      console.warn("[orderChat] rate_limit", auth.user.id);
      return c.json({ error: "rate_limited", message: "Too many messages. Try again shortly." }, 429);
    }

    const orderId = c.req.param("id");
    const bodyJson = await c.req.json().catch(() => ({}));
    const pair = parseOrderChatPair(
      typeof bodyJson.pair === "string" ? bodyJson.pair : c.req.query("pair") ?? "",
    );
    if (!pair || pair === "support") {
      return c.json({ error: "invalid_pair" }, 400);
    }

    const rawBody = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    const quickReplyKey =
      typeof bodyJson.quick_reply_key === "string" && bodyJson.quick_reply_key.trim()
        ? bodyJson.quick_reply_key.trim().slice(0, 80)
        : null;

    if (!rawBody) return c.json({ error: "invalid_body", message: "Message cannot be empty." }, 400);
    if (rawBody.length > MAX_BODY_LEN) {
      return c.json({
        error: "invalid_body",
        message: `Message must be at most ${MAX_BODY_LEN} characters.`,
      }, 400);
    }

    const serviceSb = deps.getServiceSupabase();
    const order = await loadOrderForChat(serviceSb, orderId);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { role } = await resolveViewerRole(order, auth.user.id, auth.user.email);
    if (!role) return c.json({ error: "forbidden" }, 403);

    const pairEnabled = await isPairFlagEnabled(pair);
    const access = assertOrderChatAccess({
      order,
      pair,
      userId: auth.user.id,
      viewerRole: role,
      requireOpen: true,
      pairEnabled,
    });
    if (!access.ok) {
      console.warn("[orderChat] chat_not_available", { orderId, pair, error: access.error });
      return c.json({ error: access.error, message: access.message }, access.status);
    }

    const stampCourier =
      pair === "customer_courier" || pair === "merchant_courier"
        ? access.courierUserId
        : null;

    if ((pair === "customer_courier" || pair === "merchant_courier") && !stampCourier) {
      return c.json({
        error: "pre_assignment",
        message: "A courier will be assigned soon.",
      }, 403);
    }

    const { data: inserted, error } = await deps.getPublicServiceSupabase()
      .from("order_messages")
      .insert({
        order_id: orderId,
        pair,
        sender_user_id: auth.user.id,
        sender_role: access.senderRole,
        body: rawBody,
        quick_reply_key: quickReplyKey,
        courier_user_id: stampCourier,
      })
      .select(
        "id, order_id, pair, sender_user_id, sender_role, body, quick_reply_key, courier_user_id, created_at",
      )
      .single();

    if (error || !inserted) {
      return c.json({
        error: "insert_failed",
        message: error?.message ?? "Could not send message.",
      }, 500);
    }

    await auditOrderChat(serviceSb, orderId, auth.user.id, "order_message_sent", {
      sender_role: access.senderRole,
      message_id: inserted.id,
      pair,
    });

    void notifyOrderChatRecipients({
      orderId,
      orderNumber: order.order_number,
      merchantId: order.merchant_id,
      pair,
      senderUserId: auth.user.id,
      senderRole: access.senderRole,
      preview: rawBody,
      customerUserId: order.customer_user_id,
      courierUserId: stampCourier,
    });

    return c.json({ message: toOrderMessageDto(inserted as Record<string, unknown>) });
  });

  app.post("/orders/:id/messages/:messageId/report", async (c: Context) => {
    const auth = await requireAuthUser(deps, c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const orderId = c.req.param("id");
    const messageId = c.req.param("messageId");
    const bodyJson = await c.req.json().catch(() => ({}));
    const reason =
      typeof bodyJson.reason === "string" ? bodyJson.reason.trim().slice(0, 500) : null;

    const serviceSb = deps.getServiceSupabase();
    const order = await loadOrderForChat(serviceSb, orderId);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { role } = await resolveViewerRole(order, auth.user.id, auth.user.email);
    if (!role) return c.json({ error: "forbidden" }, 403);

    const publicSb = deps.getPublicServiceSupabase();
    const { data: msg } = await publicSb
      .from("order_messages")
      .select("id, order_id")
      .eq("id", messageId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (!msg) return c.json({ error: "not_found" }, 404);

    const { error } = await publicSb.from("order_message_reports").insert({
      message_id: messageId,
      order_id: orderId,
      reporter_user_id: auth.user.id,
      reason,
    });
    if (error) {
      if (String(error.message).includes("duplicate") || error.code === "23505") {
        return c.json({ ok: true, already_reported: true });
      }
      return c.json({ error: "report_failed", message: error.message }, 500);
    }

    try {
      await serviceSb.from("support_cases").insert({
        subject: `Chat report — order ${order.order_number ?? orderId}`,
        body: reason || `Message ${messageId} reported by ${role}`,
        status: "open",
        priority: "normal",
        customer_id: order.customer_id,
        order_id: orderId,
        created_by: auth.user.id,
      });
    } catch (e) {
      console.warn("[orderChat] support case create failed", e);
    }

    await auditOrderChat(serviceSb, orderId, auth.user.id, "order_message_reported", {
      message_id: messageId,
      reason,
    });

    return c.json({ ok: true });
  });

  /** Customer SOS / report-a-problem — opens support-visible context. */
  app.post("/orders/:id/chat/report-problem", async (c: Context) => {
    const auth = await requireAuthUser(deps, c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const orderId = c.req.param("id");
    const bodyJson = await c.req.json().catch(() => ({}));
    const details =
      typeof bodyJson.details === "string" ? bodyJson.details.trim().slice(0, 500) : "Report a problem";

    const serviceSb = deps.getServiceSupabase();
    const order = await loadOrderForChat(serviceSb, orderId);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { role } = await resolveViewerRole(order, auth.user.id, auth.user.email);
    if (!role) return c.json({ error: "forbidden" }, 403);

    const { data: supportCase, error } = await serviceSb.from("support_cases").insert({
      subject: `Safety / problem — order ${order.order_number ?? orderId}`,
      body: details,
      status: "open",
      priority: "high",
      customer_id: order.customer_id,
      order_id: orderId,
      created_by: auth.user.id,
    }).select("id").single();

    if (error) return c.json({ error: error.message }, 500);

    await deps.getPublicServiceSupabase().from("order_messages").insert({
      order_id: orderId,
      pair: "support",
      sender_user_id: auth.user.id,
      sender_role: role === "merchant" ? "merchant" : role === "courier" ? "courier" : "customer",
      body: details,
      quick_reply_key: "sos.report_problem",
      courier_user_id: order.courier_id,
    });

    await auditOrderChat(serviceSb, orderId, auth.user.id, "order_chat_problem_reported", {
      case_id: supportCase?.id,
    });

    return c.json({ ok: true, case_id: supportCase?.id });
  });
}
