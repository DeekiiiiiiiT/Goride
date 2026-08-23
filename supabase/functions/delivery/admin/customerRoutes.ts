/**
 * Dash admin — customer management.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashDelete, requireDashWrite } from "./dashPermissions.ts";
import { getAuthAdmin, getDb, writeKvAudit } from "./merchantAdminShared.ts";

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

export function registerCustomerAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/", async (c) => {
    const q = c.req.query("q")?.trim();
    const status = c.req.query("status")?.trim();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const db = getDb();

    let query = db.from("customers").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
    }
    if (status === "active" || status === "suspended") {
      query = query.eq("account_status", status);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);

    const customers = await Promise.all((data ?? []).map(async (row) => {
      const userId = (row as Record<string, unknown>).user_id as string;
      let authEmail = "";
      if (userId) {
        try {
          const { data: u } = await getAuthAdmin().auth.admin.getUserById(userId);
          authEmail = u?.user?.email || "";
        } catch { /* ignore */ }
      }
      return { ...row, authEmail };
    }));

    return c.json({ customers, total: count ?? 0, page, limit });
  });

  admin.get("/:id", async (c) => {
    const { id } = c.req.param();
    const db = getDb();
    const { data: customer, error } = await db.from("customers").select("*").eq("id", id).single();
    if (error || !customer) return c.json({ error: "Customer not found" }, 404);

    const { data: orders } = await db.from("orders")
      .select("id, order_number, status, total, placed_at, merchant_id, payment_status")
      .eq("customer_id", id)
      .order("placed_at", { ascending: false })
      .limit(25);

    const merchantIds = [...new Set((orders ?? []).map((o) => String(o.merchant_id || "")).filter(Boolean))];
    const merchantNameById = new Map<string, string>();
    if (merchantIds.length > 0) {
      const { data: merchants } = await db.from("merchants").select("id, name").in("id", merchantIds);
      for (const m of merchants || []) {
        merchantNameById.set(String(m.id), String(m.name || ""));
      }
    }

    const recentOrders = (orders ?? []).map((o) => ({
      ...o,
      merchant_name: merchantNameById.get(String(o.merchant_id)) || null,
    }));

    const { count: orderCount } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id);

    const { data: spendRows } = await db
      .from("orders")
      .select("total")
      .eq("customer_id", id)
      .neq("status", "cancelled");

    const lifetimeSpend = (spendRows || []).reduce((sum, r) => sum + Number(r.total || 0), 0);

    const userId = (customer as Record<string, unknown>).user_id as string;
    let authEmail = "";
    if (userId) {
      try {
        const { data: u } = await getAuthAdmin().auth.admin.getUserById(userId);
        authEmail = u?.user?.email || "";
      } catch { /* ignore */ }
    }

    // Saved addresses live directly on the customer row (jsonb array).
    const rawAddresses = (customer as Record<string, unknown>).saved_addresses;
    const savedAddresses = Array.isArray(rawAddresses) ? rawAddresses : [];

    // Push devices — graceful empty if the customer has no subscriptions.
    let pushDevices: Array<{ channel: string; lastUsedAt: string | null; createdAt: string | null }> = [];
    if (userId) {
      const { data: pushRows } = await db
        .from("customer_push_subscriptions")
        .select("channel, last_used_at, created_at")
        .eq("customer_user_id", userId)
        .order("created_at", { ascending: false });
      pushDevices = (pushRows ?? []).map((p) => ({
        channel: String((p as Record<string, unknown>).channel || "web"),
        lastUsedAt: (p as Record<string, unknown>).last_used_at
          ? String((p as Record<string, unknown>).last_used_at)
          : null,
        createdAt: (p as Record<string, unknown>).created_at
          ? String((p as Record<string, unknown>).created_at)
          : null,
      }));
    }

    // Open disputes tied to this customer's orders.
    let openDisputes = 0;
    const { data: customerOrderIds } = await db
      .from("orders")
      .select("id")
      .eq("customer_id", id);
    const orderIdList = (customerOrderIds ?? []).map((o) => String((o as Record<string, unknown>).id));
    if (orderIdList.length > 0) {
      const { count: disputeCount } = await db
        .from("order_disputes")
        .select("id", { count: "exact", head: true })
        .in("order_id", orderIdList)
        .in("status", ["open", "investigating"]);
      openDisputes = disputeCount ?? 0;
    }

    // Payment methods — expose metadata only, never provider tokens.
    let paymentMethods: Array<{
      id: string;
      provider: string;
      type: string;
      brand: string | null;
      last4: string | null;
      isDefault: boolean;
      hasToken: boolean;
    }> = [];
    try {
      const { data: pmRows } = await getPaymentsDb()
        .from("customer_payment_methods")
        .select("id, provider, type, brand, last4, is_default, provider_method_id, is_active")
        .eq("customer_id", id)
        .eq("is_active", true);
      paymentMethods = (pmRows ?? []).map((p) => {
        const row = p as Record<string, unknown>;
        return {
          id: String(row.id),
          provider: String(row.provider || ""),
          type: String(row.type || ""),
          brand: row.brand ? String(row.brand) : null,
          last4: row.last4 ? String(row.last4) : null,
          isDefault: Boolean(row.is_default),
          hasToken: Boolean(row.provider_method_id),
        };
      });
    } catch { /* payments schema optional — graceful empty */ }

    return c.json({
      customer: { ...customer, authEmail },
      recentOrders,
      orderCount: orderCount ?? 0,
      lifetimeSpend: Math.round(lifetimeSpend * 100) / 100,
      savedAddresses,
      pushDevices,
      openDisputes,
      paymentMethods,
    });
  });

  admin.patch("/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    if (!Object.prototype.hasOwnProperty.call(body, "admin_internal_notes")) {
      return c.json({ error: "admin_internal_notes required" }, 400);
    }
    const notes = body.admin_internal_notes == null ? null : String(body.admin_internal_notes);
    const db = getDb();
    const { data, error } = await db
      .from("customers")
      .update({
        admin_internal_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(
      adminUser,
      "roam_dash.customer_notes_updated",
      id,
      String((data as { email?: string })?.email || ""),
      "admin_internal_notes updated",
    );
    return c.json({ customer: data });
  });

  admin.post("/:id/suspend", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return c.json({ error: "reason_required", message: "Suspension reason is required" }, 400);
    }
    const db = getDb();
    const now = new Date().toISOString();
    const { data, error } = await db.from("customers").update({
      account_status: "suspended",
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: adminUser.id,
    }).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(
      adminUser,
      "roam_dash.customer_suspended",
      c.req.param("id"),
      String((data as { email?: string })?.email || ""),
      reason,
    );
    return c.json({ customer: data });
  });

  admin.post("/:id/unsuspend", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const db = getDb();
    const { data, error } = await db.from("customers").update({
      account_status: "active",
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
    }).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(
      adminUser,
      "roam_dash.customer_unsuspended",
      c.req.param("id"),
      String((data as { email?: string })?.email || ""),
      "Account restored to active",
    );
    return c.json({ customer: data });
  });

  admin.post("/:id/force-sign-out", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { id } = c.req.param();
    const db = getDb();
    const { data: customer, error } = await db
      .from("customers")
      .select("id, name, email, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const userId = String((customer as Record<string, unknown>).user_id || "");
    if (!userId) return c.json({ error: "Customer has no linked auth account" }, 400);

    // Revoke all refresh tokens/sessions for this user (global sign-out).
    const { error: signOutErr } = await getAuthAdmin().auth.admin.signOut(userId, "global");
    if (signOutErr) return c.json({ error: signOutErr.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.customer_force_signed_out",
      id,
      String((customer as { email?: string })?.email || ""),
      "All sessions revoked by admin",
    );

    return c.json({ ok: true, message: "All active sessions revoked." });
  });

  admin.delete("/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    const confirmName = String(body.confirm_name || "").trim();
    if (!reason) return c.json({ error: "reason is required" }, 400);
    if (!confirmName) return c.json({ error: "confirm_name is required" }, 400);

    const db = getDb();
    const { data: customer, error: fetchErr } = await db
      .from("customers")
      .select("id, name, email, user_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return c.json({ error: fetchErr.message }, 500);
    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const row = customer as Record<string, unknown>;
    const customerName = String(row.name || "").trim();
    const expectedConfirm = (customerName || id).toLowerCase();
    if (confirmName.toLowerCase() !== expectedConfirm) {
      return c.json({ error: "confirm_name must match customer name" }, 400);
    }

    const { error: ordersErr } = await db.from("orders").delete().eq("customer_id", id);
    if (ordersErr) return c.json({ error: ordersErr.message }, 500);

    const customerEmail = String(row.email || "");
    await writeKvAudit(
      adminUser,
      "roam_dash.customer_deleted",
      id,
      customerEmail,
      `${reason} | name=${customerName || "(unnamed)"}`,
    );

    const { error: deleteErr } = await db.from("customers").delete().eq("id", id);
    if (deleteErr) return c.json({ error: deleteErr.message }, 500);

    return c.json({
      ok: true,
      message:
        "Dash customer profile removed. Roam login and other app profiles were not changed.",
    });
  });

  app.route("/admin/customers", admin);
}
