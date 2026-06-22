/**
 * Dash admin — finance, payouts, disputes, reviews, promotions.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb } from "./merchantAdminShared.ts";

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

export function registerFinanceAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/payouts", async (c) => {
    const { merchant_id, status } = c.req.query();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const pdb = getPaymentsDb();
    let query = pdb.from("merchant_payouts").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (merchant_id) query = query.eq("merchant_id", merchant_id);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ payouts: data ?? [], total: count ?? 0, page, limit });
  });

  admin.get("/payouts/:id", async (c) => {
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts").select("*").eq("id", c.req.param("id")).single();
    if (error || !data) return c.json({ error: "Payout not found" }, 404);
    return c.json({ payout: data });
  });

  admin.post("/payouts/:id/hold", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "Held by admin");
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts")
      .update({ status: "held", notes: reason })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ payout: data });
  });

  admin.post("/payouts/:id/release", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts")
      .update({ status: "pending" })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ payout: data });
  });

  admin.post("/adjustments", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const merchantId = body.merchant_id as string;
    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();
    if (!merchantId || !reason || Number.isNaN(amount)) {
      return c.json({ error: "merchant_id, amount, and reason required" }, 400);
    }
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_adjustments").insert({
      merchant_id: merchantId,
      amount,
      reason,
      created_by: admin.id,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ adjustment: data }, 201);
  });

  admin.get("/disputes", async (c) => {
    const status = c.req.query("status");
    const db = getDb();
    let query = db.from("order_disputes").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ disputes: data ?? [] });
  });

  admin.patch("/disputes/:id", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      handled_by: admin.id,
    };
    if (body.status) updates.status = body.status;
    if (body.resolution_notes != null) updates.resolution_notes = body.resolution_notes;
    if (body.refund_amount != null) updates.refund_amount = Number(body.refund_amount);
    const { data, error } = await db.from("order_disputes")
      .update(updates).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ dispute: data });
  });

  admin.get("/reviews", async (c) => {
    const merchantId = c.req.query("merchant_id");
    const flagged = c.req.query("flagged") === "true";
    const db = getDb();
    let query = db.from("orders")
      .select("id, order_number, merchant_id, customer_rating, customer_review, review_hidden, placed_at")
      .not("customer_review", "is", null)
      .order("placed_at", { ascending: false });
    if (merchantId) query = query.eq("merchant_id", merchantId);
    if (flagged) query = query.eq("review_hidden", true);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ reviews: data ?? [] });
  });

  admin.patch("/reviews/:orderId", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const { data, error } = await db.from("orders")
      .update({ review_hidden: Boolean(body.review_hidden) })
      .eq("id", c.req.param("orderId"))
      .select("id, order_number, customer_rating, customer_review, review_hidden")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ review: data });
  });

  admin.get("/promotions", async (c) => {
    const merchantId = c.req.query("merchant_id");
    const status = c.req.query("status");
    const db = getDb();
    let query = db.from("merchant_promotions").select("*").order("created_at", { ascending: false });
    if (merchantId) query = query.eq("merchant_id", merchantId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotions: data ?? [] });
  });

  admin.post("/promotions/:id/disable", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const db = getDb();
    const { data, error } = await db.from("merchant_promotions")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotion: data });
  });

  app.route("/admin/finance", admin);
}
