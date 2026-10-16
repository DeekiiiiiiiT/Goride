/**
 * Dash admin — partner menu price-rise review queue (partner.menu.price_change_review_pct).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb } from "./merchantAdminShared.ts";

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

export function registerMenuPriceReviewAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  /** GET /admin/menu-price-reviews?status=pending */
  admin.get("/menu-price-reviews", async (c) => {
    const status = (c.req.query("status") || "pending").trim();
    const db = getDb();
    let q = db
      .from("menu_price_change_requests")
      .select(
        "id, merchant_id, item_id, old_price, new_price, pct_increase, status, requested_by, decided_by, decided_at, created_at, merchant:merchants(id, name)",
      )
      .order("created_at", { ascending: true })
      .limit(200);
    if (status && status !== "all") {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const rows = data ?? [];
    const itemIds = [
      ...new Set(
        rows
          .map((r) => String((r as { item_id?: string }).item_id || ""))
          .filter(Boolean),
      ),
    ];
    const nameByItem = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: items } = await db
        .from("menu_items")
        .select("id, name")
        .in("id", itemIds);
      for (const it of items ?? []) {
        nameByItem.set(String((it as { id: string }).id), String((it as { name?: string }).name || ""));
      }
    }

    const requests = rows.map((r) => {
      const row = r as Record<string, unknown>;
      const itemId = String(row.item_id || "");
      return {
        ...row,
        item_name: nameByItem.get(itemId) || null,
      };
    });
    return c.json({ requests });
  });

  /** POST /admin/menu-price-reviews/:id/approve — apply new_price, mark approved */
  admin.post("/menu-price-reviews/:id/approve", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const adminUser = adminFromCtx(c);
    const id = c.req.param("id");
    const db = getDb();

    const { data: row, error: fetchErr } = await db
      .from("menu_price_change_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return c.json({ error: fetchErr.message }, 500);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.status) !== "pending") {
      return c.json({ error: "not_pending", status: row.status }, 409);
    }

    const newPrice = Number(row.new_price);
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return c.json({ error: "invalid_new_price" }, 400);
    }

    const { error: itemErr } = await db
      .from("menu_items")
      .update({
        price: newPrice,
        marketplace_price: newPrice,
      })
      .eq("id", row.item_id)
      .eq("merchant_id", row.merchant_id);
    if (itemErr) return c.json({ error: itemErr.message }, 500);

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await db
      .from("menu_price_change_requests")
      .update({
        status: "approved",
        decided_by: adminUser.id,
        decided_at: now,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ request: updated });
  });

  /** POST /admin/menu-price-reviews/:id/reject */
  admin.post("/menu-price-reviews/:id/reject", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const adminUser = adminFromCtx(c);
    const id = c.req.param("id");
    const db = getDb();

    const { data: row, error: fetchErr } = await db
      .from("menu_price_change_requests")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return c.json({ error: fetchErr.message }, 500);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.status) !== "pending") {
      return c.json({ error: "not_pending", status: row.status }, 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await db
      .from("menu_price_change_requests")
      .update({
        status: "rejected",
        decided_by: adminUser.id,
        decided_at: now,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ request: updated });
  });

  app.route("/admin", admin);
}
