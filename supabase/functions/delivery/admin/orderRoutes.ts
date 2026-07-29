/**
 * Shared order admin routes — dash and courier product admins.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { requireWrite as requireCourierWrite } from "./permissions.ts";
import { getDb } from "./merchantAdminShared.ts";
import { orchestrateOrderRefund } from "./orderRefund.ts";

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

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
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
    const pdb = getPaymentsDb();

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

    const { data: transaction } = await pdb
      .from("transactions")
      .select("id, amount, currency, status, provider, created_at")
      .eq("order_id", orderId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: refunds } = await pdb
      .from("refunds")
      .select("id, amount, status, reason, created_at, completed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    return c.json({
      order: { ...order, courier_display_name: courierName },
      events: events ?? [],
      transaction: transaction ?? null,
      refunds: refunds ?? [],
    });
  });

  orders.post("/:orderId/refund", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const product = c.get("adminProduct") as "dash" | "courier";
    // Money movement is Dash write only (courier admin cannot refund)
    if (product !== "dash") {
      return c.json({ error: "forbidden", message: "Dash write role required for refunds" }, 403);
    }
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const orderId = c.req.param("orderId");
    const body = await c.req.json().catch(() => ({})) as { amount?: number; reason?: string };
    const reason = String(body.reason || "").trim();
    if (!reason) return c.json({ error: "reason is required" }, 400);

    const authHeader = c.req.header("Authorization") || "";
    const result = await orchestrateOrderRefund({
      orderId,
      amount: body.amount != null ? Number(body.amount) : null,
      reason,
      admin: adminUser,
      authHeader,
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);

    const { data: order } = await getDb().from("orders").select("*").eq("id", orderId).maybeSingle();
    return c.json({
      ok: true,
      refund: result.refund,
      payment_status: result.payment_status,
      providerCompleted: result.providerCompleted,
      providerError: result.providerError ?? null,
      order,
    }, 201);
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

    const { data: existing } = await db.from("orders")
      .select("courier_id, payment_status")
      .eq("id", orderId)
      .maybeSingle();

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

    const courierId = (existing as { courier_id?: string | null } | null)?.courier_id
      ?? (order as { courier_id?: string | null }).courier_id;
    if (courierId) {
      await db
        .from("courier_availability")
        .update({ active_order_id: null })
        .eq("driver_id", courierId);
    }

    await db.from("order_events").insert({
      order_id: orderId,
      status: "cancelled",
      actor_type: "admin",
      actor_id: adminUser.id,
      notes: reason,
    });

    let refund: RefundOrchestratorResultSummary | null = null;
    const payStatus = String(
      (existing as { payment_status?: string } | null)?.payment_status
        ?? (order as { payment_status?: string }).payment_status
        ?? "",
    );
    if (product === "dash" && payStatus === "paid") {
      const authHeader = c.req.header("Authorization") || "";
      const result = await orchestrateOrderRefund({
        orderId,
        amount: null,
        reason: `Admin cancel: ${reason}`,
        admin: adminUser,
        authHeader,
      });
      if (result.ok) {
        refund = {
          payment_status: result.payment_status,
          providerCompleted: result.providerCompleted,
          providerError: result.providerError ?? null,
          refund_id: String(result.refund.id || ""),
        };
      } else {
        refund = { error: result.error };
      }
    }

    const { data: refreshed } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
    return c.json({ ok: true, order: refreshed || order, refund });
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

type RefundOrchestratorResultSummary = {
  payment_status?: string;
  providerCompleted?: boolean;
  providerError?: string | null;
  refund_id?: string;
  error?: string;
};
