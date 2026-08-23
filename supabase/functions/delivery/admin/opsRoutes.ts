/**
 * Rush Ops admin — live order monitoring and manual re-dispatch.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getAuthAdmin, getDb, writeKvAudit } from "./merchantAdminShared.ts";
import { dispatchOffersForOrder } from "../courierConsumerRoutes.ts";
import { insertCourierReassignedSystemMessages } from "../orderChat.ts";
import { ORDER_CUSTOMER_EMBED } from "../orderSelectEmbeds.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Orders considered "in flight" for the live ops board. */
const LIVE_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "in_transit",
] as const;

export function registerOpsAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/live-orders", async (c) => {
    const db = getDb();
    const statusFilter = c.req.query("status");
    const statuses = statusFilter ? [statusFilter] : [...LIVE_STATUSES];

    const { data: orders, error } = await db
      .from("orders")
      .select(`
        id, order_number, status, payment_status, total, placed_at, ready_at,
        assigned_at, picked_up_at, merchant_id, customer_id, courier_id,
        delivery_address, delivery_lat, delivery_lng, courier_lat, courier_lng,
        courier_location_updated_at,
        merchant:merchants(id, name, address, lat, lng, phone),
        ${ORDER_CUSTOMER_EMBED}
      `)
      .in("status", statuses)
      .order("placed_at", { ascending: true })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);

    // Attach courier email (auth) best-effort for assigned orders.
    const courierIds = [
      ...new Set((orders ?? [])
        .map((o) => String((o as Record<string, unknown>).courier_id || ""))
        .filter(Boolean)),
    ];
    const courierEmailById = new Map<string, string>();
    if (courierIds.length > 0) {
      const auth = getAuthAdmin();
      await Promise.all(courierIds.map(async (cid) => {
        try {
          const { data: u } = await auth.auth.admin.getUserById(cid);
          if (u?.user?.email) courierEmailById.set(cid, u.user.email);
        } catch { /* ignore */ }
      }));
    }

    const liveOrders = (orders ?? []).map((o) => {
      const row = o as Record<string, unknown>;
      const cid = String(row.courier_id || "");
      return { ...row, courier_email: cid ? (courierEmailById.get(cid) || null) : null };
    });

    return c.json({ orders: liveOrders, count: liveOrders.length });
  });

  admin.post("/orders/:id/redispatch", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const orderId = c.req.param("id");
    const db = getDb();

    const { data: order, error } = await db
      .from("orders")
      .select("id, order_number, status, courier_id, merchant_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!order) return c.json({ error: "Order not found" }, 404);

    const row = order as Record<string, unknown>;
    if (["delivered", "cancelled"].includes(String(row.status))) {
      return c.json({ error: `Cannot redispatch a ${row.status} order` }, 400);
    }

    const previousCourier = row.courier_id ? String(row.courier_id) : null;

    // Free the current courier and return the order to the dispatchable pool.
    const { data: updated, error: updateErr } = await db
      .from("orders")
      .update({
        courier_id: null,
        status: "ready",
        assigned_at: null,
      })
      .eq("id", orderId)
      .select()
      .single();
    if (updateErr) return c.json({ error: updateErr.message }, 500);

    // Release the previous courier's availability slot.
    if (previousCourier) {
      await db.from("courier_availability")
        .update({ active_order_id: null })
        .eq("driver_id", previousCourier);
      try {
        const publicSb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await insertCourierReassignedSystemMessages(publicSb, orderId, String(previousCourier));
      } catch (e) {
        console.warn("[ops redispatch] chat reassignment notice failed", e);
      }
    }
    await db.from("courier_availability")
      .update({ active_order_id: null })
      .eq("active_order_id", orderId);

    // Supersede any live offers, then fan out a fresh wave.
    await db.from("courier_offers")
      .update({ status: "superseded" })
      .eq("order_id", orderId)
      .eq("status", "pending");

    let offersCreated = 0;
    try {
      offersCreated = await dispatchOffersForOrder(db, orderId);
    } catch (e) {
      console.error("[ops redispatch] dispatch failed:", e);
    }

    await db.from("order_events").insert({
      order_id: orderId,
      status: "ready",
      actor_type: "admin",
      actor_id: adminUser.id,
      notes: `Manual redispatch by ${adminUser.email || "admin"}`,
    });

    await writeKvAudit(
      adminUser,
      "roam_dash.order_redispatched",
      orderId,
      "",
      `#${row.order_number} — freed ${previousCourier || "(none)"}, offers=${offersCreated}`,
    );

    return c.json({ ok: true, order: updated, offersCreated });
  });

  app.route("/admin/ops", admin);
}
