/**
 * Rush Ops admin — support case desk + structured audit event history.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";

const CASE_STATUSES = new Set(["open", "pending", "resolved", "closed"]);
const CASE_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

export function registerSupportAdminRoutes(app: Hono) {
  const support = new Hono();
  support.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  support.get("/cases", async (c) => {
    const status = c.req.query("status");
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const db = getDb();
    let query = db.from("support_cases").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (status && CASE_STATUSES.has(status)) query = query.eq("status", status);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ cases: data ?? [], total: count ?? 0, page, limit });
  });

  support.get("/cases/:id", async (c) => {
    const db = getDb();
    const { data, error } = await db.from("support_cases").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Case not found" }, 404);
    return c.json({ case: data });
  });

  support.post("/cases", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    if (!subject) return c.json({ error: "subject is required" }, 400);
    const priority = String(body.priority || "normal");
    const status = String(body.status || "open");

    const db = getDb();
    const { data, error } = await db.from("support_cases").insert({
      subject,
      body: body.body != null ? String(body.body) : null,
      status: CASE_STATUSES.has(status) ? status : "open",
      priority: CASE_PRIORITIES.has(priority) ? priority : "normal",
      customer_id: body.customer_id ? String(body.customer_id) : null,
      order_id: body.order_id ? String(body.order_id) : null,
      contact_email: body.contact_email ? String(body.contact_email) : null,
      assigned_to: body.assigned_to ? String(body.assigned_to) : null,
      created_by: adminUser.id,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.support_case_created", String(data.id), body.contact_email || "", subject);
    return c.json({ case: data }, 201);
  });

  support.patch("/cases/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.subject != null) updates.subject = String(body.subject);
    if (body.body != null) updates.body = String(body.body);
    if (body.status != null && CASE_STATUSES.has(String(body.status))) updates.status = String(body.status);
    if (body.priority != null && CASE_PRIORITIES.has(String(body.priority))) updates.priority = String(body.priority);
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to ? String(body.assigned_to) : null;
    if (body.resolution_notes != null) updates.resolution_notes = String(body.resolution_notes);

    const db = getDb();
    const { data, error } = await db.from("support_cases")
      .update(updates).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.support_case_updated", c.req.param("id"), "", JSON.stringify(updates));
    return c.json({ case: data });
  });

  app.route("/admin/support", support);

  // ---- Audit event history ----
  const audit = new Hono();
  audit.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  audit.get("/events", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const pdb = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "platform" } },
    );
    const { data: platformEvents, error: pErr, count: pCount } = await pdb
      .from("permission_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!pErr && (platformEvents?.length ?? 0) > 0) {
      return c.json({
        events: (platformEvents ?? []).map((e) => ({
          id: String(e.id),
          actor_id: e.actor_user_id,
          action: e.action,
          target_id: e.target_user_id ?? e.resource_id,
          details: JSON.stringify(e.metadata ?? {}),
          created_at: e.created_at,
        })),
        total: pCount ?? 0,
        page,
        limit,
      });
    }
    const db = getDb();
    const action = c.req.query("action");
    const actorId = c.req.query("actor_id");
    let query = db.from("admin_audit_events").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (action) query = query.eq("action", action);
    if (actorId) query = query.eq("actor_id", actorId);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ events: data ?? [], total: count ?? 0, page, limit });
  });

  app.route("/admin/audit", audit);
}
