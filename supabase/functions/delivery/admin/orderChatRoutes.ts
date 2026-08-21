/**
 * Admin support chat — read all pairs + inject as Roam Support.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import { parseOrderChatPair, type OrderChatPair } from "../orderChatAccess.ts";
import { toOrderMessageDto } from "../orderChat.ts";
import { notifyOrderChatRecipients } from "../orderChatNotify.ts";

function publicSb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const MAX_BODY_LEN = 500;

export function registerAdminOrderChatRoutes(app: Hono) {
  const chat = new Hono();
  chat.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  chat.get("/orders/:id/messages", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const orderId = c.req.param("id");
    const pairFilter = parseOrderChatPair(c.req.query("pair") ?? "");
    const db = getDb();

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, merchant_id, courier_id, customer_id, customer:customers!orders_customer_id_fkey(user_id)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return c.json({ error: "not_found" }, 404);

    let query = publicSb()
      .from("order_messages")
      .select(
        "id, order_id, pair, sender_user_id, sender_role, body, quick_reply_key, courier_user_id, created_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (pairFilter) query = query.eq("pair", pairFilter);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    await writeKvAudit(
      adminUser,
      "order_chat_support_viewed",
      orderId,
      "",
      `pairs=${pairFilter ?? "all"} count=${(data ?? []).length}`,
    );

    return c.json({
      messages: (data ?? []).map((row) => toOrderMessageDto(row as Record<string, unknown>)),
      order: {
        id: order.id,
        order_number: (order as { order_number?: string }).order_number,
      },
    });
  });

  chat.post("/orders/:id/messages", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const orderId = c.req.param("id");
    const bodyJson = await c.req.json().catch(() => ({}));
    const pair: OrderChatPair =
      parseOrderChatPair(typeof bodyJson.pair === "string" ? bodyJson.pair : "support") ?? "support";
    const rawBody = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    if (!rawBody) return c.json({ error: "invalid_body" }, 400);
    if (rawBody.length > MAX_BODY_LEN) {
      return c.json({ error: "invalid_body", message: `Max ${MAX_BODY_LEN} chars` }, 400);
    }

    const db = getDb();
    const { data: order } = await db
      .from("orders")
      .select("id, order_number, merchant_id, courier_id, customer:customers!orders_customer_id_fkey(user_id)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return c.json({ error: "not_found" }, 404);

    const customer = (order as { customer?: { user_id?: string } }).customer;
    const courierId = (order as { courier_id?: string | null }).courier_id ?? null;
    const stampCourier =
      pair === "customer_courier" || pair === "merchant_courier" || pair === "support"
        ? courierId
        : null;

    const { data: inserted, error } = await publicSb()
      .from("order_messages")
      .insert({
        order_id: orderId,
        pair,
        sender_user_id: adminUser.id,
        sender_role: "support",
        body: rawBody,
        quick_reply_key: null,
        courier_user_id: stampCourier,
      })
      .select(
        "id, order_id, pair, sender_user_id, sender_role, body, quick_reply_key, courier_user_id, created_at",
      )
      .single();

    if (error || !inserted) {
      return c.json({ error: error?.message ?? "insert_failed" }, 500);
    }

    await writeKvAudit(
      adminUser,
      "order_chat_support_message",
      orderId,
      "",
      `pair=${pair} message_id=${inserted.id}`,
    );

    void notifyOrderChatRecipients({
      orderId,
      orderNumber: (order as { order_number?: string }).order_number,
      merchantId: String((order as { merchant_id: string }).merchant_id),
      pair,
      senderUserId: adminUser.id,
      senderRole: "support",
      preview: rawBody,
      customerUserId: customer?.user_id ? String(customer.user_id) : null,
      courierUserId: courierId ? String(courierId) : null,
    });

    return c.json({ message: toOrderMessageDto(inserted as Record<string, unknown>) }, 201);
  });

  app.route("/admin", chat);
}
