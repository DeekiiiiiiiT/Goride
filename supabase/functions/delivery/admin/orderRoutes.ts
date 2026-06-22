/**
 * Shared order admin routes — dash and courier product admins.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { requireWrite as requireCourierWrite } from "./permissions.ts";
import { getDb } from "./merchantAdminShared.ts";

async function requireDashOrCourierAdmin(c: { req: { header: (n: string) => string | undefined } }) {
  const dash = await requireProductAdmin(c, "dash");
  if (!(dash instanceof Response)) return { admin: dash, product: "dash" as const };
  const courier = await requireProductAdmin(c, "courier");
  if (!(courier instanceof Response)) return { admin: courier, product: "courier" as const };
  return dash;
}

function requireOrderWrite(admin: ProductAdminUser, product: "dash" | "courier"): Response | null {
  if (product === "dash") return requireDashWrite(admin);
  return requireCourierWrite(admin);
}

export function registerOrderAdminRoutes(app: Hono) {
  const orders = new Hono();

  orders.use("*", async (c, next) => {
    const result = await requireDashOrCourierAdmin(c);
    if (result instanceof Response) return result;
    c.set("adminUser", result.admin);
    c.set("adminProduct", result.product);
    await next();
  });

  orders.get("/", async (c) => {
    const db = getDb();
    const { status, merchant_id, customer_id, courier_id, q, from, to } = c.req.query();
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const offset = (page - 1) * limit;

    let query = db.from("orders").select("*", { count: "exact" }).order("placed_at", { ascending: false });
    if (status && status !== "all") {
      if (status === "live") {
        query = query.in("status", ["placed", "accepted", "preparing", "ready", "picked_up", "in_transit"]);
      } else {
        query = query.eq("status", status);
      }
    }
    if (merchant_id) query = query.eq("merchant_id", merchant_id);
    if (customer_id) query = query.eq("customer_id", customer_id);
    if (courier_id) query = query.eq("courier_id", courier_id);
    if (from) query = query.gte("placed_at", from);
    if (to) query = query.lte("placed_at", to);
    if (q?.trim()) {
      const pattern = `%${q.trim()}%`;
      query = query.or(`order_number.ilike.${pattern},delivery_address.ilike.${pattern}`);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ orders: data ?? [], total: count ?? 0, page, limit });
  });

  orders.get("/:orderId", async (c) => {
    const orderId = c.req.param("orderId");
    const db = getDb();

    const { data: order, error } = await db.from("orders")
      .select(`*, merchant:merchants(id, name, phone, address), customer:customers(id, name, phone)`)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) return c.json({ error: "not_found" }, 404);

    const { data: events } = await db.from("order_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at");

    let courierName: string | null = null;
    if ((order as Record<string, unknown>).courier_id) {
      const { data: cp } = await db.from("courier_profiles")
        .select("display_name")
        .eq("user_id", (order as Record<string, unknown>).courier_id as string)
        .maybeSingle();
      courierName = (cp?.display_name as string | null) ?? null;
    }

    return c.json({ order: { ...order, courier_display_name: courierName }, events: events ?? [] });
  });

  orders.post("/:orderId/cancel", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const product = c.get("adminProduct") as "dash" | "courier";
    const denied = requireOrderWrite(adminUser, product);
    if (denied) return denied;

    const orderId = c.req.param("orderId");
    const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
    const reason = (body.reason ?? body.notes ?? "Cancelled by support").trim();
    const db = getDb();
    const now = new Date().toISOString();

    const { data: order, error } = await db.from("orders")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: reason,
        cancelled_by: "admin",
        updated_at: now,
      })
      .eq("id", orderId)
      .select()
      .maybeSingle();

    if (error || !order) return c.json({ error: error?.message ?? "not_found" }, 404);

    await db.from("order_events").insert({
      order_id: orderId,
      status: "cancelled",
      actor_type: "admin",
      actor_id: adminUser.id,
      notes: reason,
    });

    return c.json({ ok: true, order });
  });

  orders.post("/:orderId/complete", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const product = c.get("adminProduct") as "dash" | "courier";
    const denied = requireOrderWrite(adminUser, product);
    if (denied) return denied;

    const orderId = c.req.param("orderId");
    const db = getDb();
    const now = new Date().toISOString();

    const { data: order, error } = await db.from("orders")
      .update({ status: "completed", delivered_at: now, updated_at: now })
      .eq("id", orderId)
      .select()
      .maybeSingle();

    if (error || !order) return c.json({ error: error?.message ?? "not_found" }, 404);

    await db.from("order_events").insert({
      order_id: orderId,
      status: "completed",
      actor_type: "admin",
      actor_id: adminUser.id,
      notes: "Force completed by support",
    });

    return c.json({ ok: true, order });
  });

  app.route("/admin/orders", orders);
}
