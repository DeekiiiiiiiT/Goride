/**
 * Rush Ops admin — pricing & commission configuration.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import {
  parsePricingRules,
  serializePricingRules,
} from "../../../../packages/dash-pricing/src/index.ts";
import { resolveDashOrderPricing } from "../pricingResolver.ts";
import { recordCashSettlement } from "../courierCashLedger.ts";

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

export function registerPricingAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/pricing/overview", async (c) => {
    const db = getDb();
    const [{ data: markets }, { data: tiers }, { data: profiles }] = await Promise.all([
      db.from("service_markets").select("id, slug, name, is_active").order("name"),
      db.from("merchant_tiers").select("*").order("sort_order"),
      db.from("market_pricing_profiles")
        .select("id, market_id, version, is_active, rules, effective_from, updated_at")
        .eq("is_active", true),
    ]);

    const profileByMarket = new Map(
      (profiles ?? []).map((p: Record<string, unknown>) => [String(p.market_id), p]),
    );

    const marketSummaries = (markets ?? []).map((m: Record<string, unknown>) => {
      const profile = profileByMarket.get(String(m.id));
      const rules = profile
        ? parsePricingRules(profile.rules as Record<string, unknown>)
        : null;
      return {
        market: m,
        profile: profile ?? null,
        pricing_v2_enabled: rules?.pricingV2Enabled ?? false,
      };
    });

    return c.json({
      markets: marketSummaries,
      tiers: tiers ?? [],
    });
  });

  admin.get("/pricing/markets/:marketId", async (c) => {
    const { marketId } = c.req.param();
    const db = getDb();
    const { data: market } = await db
      .from("service_markets")
      .select("id, slug, name, is_active")
      .eq("id", marketId)
      .maybeSingle();
    if (!market) return c.json({ error: "Market not found" }, 404);

    const { data: profile } = await db
      .from("market_pricing_profiles")
      .select("*")
      .eq("market_id", marketId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    return c.json({
      market,
      profile: profile ?? null,
      rules: profile
        ? parsePricingRules(profile.rules as Record<string, unknown>)
        : parsePricingRules(null),
    });
  });

  admin.put("/pricing/markets/:marketId", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { marketId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    const { data: market } = await db
      .from("service_markets")
      .select("id, slug, name")
      .eq("id", marketId)
      .maybeSingle();
    if (!market) return c.json({ error: "Market not found" }, 404);

    const { data: current } = await db
      .from("market_pricing_profiles")
      .select("*")
      .eq("market_id", marketId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const incomingRules = (body.rules ?? body) as Record<string, unknown>;
    const parsed = parsePricingRules(incomingRules);
    const serialized = serializePricingRules(parsed);
    const nextVersion = current ? Number(current.version ?? 0) + 1 : 1;

    if (current) {
      await db
        .from("market_pricing_profiles")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", current.id);
    }

    const { data: created, error } = await db
      .from("market_pricing_profiles")
      .insert({
        market_id: marketId,
        version: nextVersion,
        is_active: true,
        rules: serialized,
        created_by: adminUser.id,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      market_id: marketId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "market_pricing_updated",
      before_state: current ? { version: current.version, rules: current.rules } : null,
      after_state: { version: nextVersion, rules: serialized },
    });

    await writeKvAudit(
      adminUser,
      "roam_dash.pricing_market_updated",
      marketId,
      "",
      JSON.stringify({ version: nextVersion, market_slug: market.slug }),
    );

    return c.json({ profile: created, rules: parsed });
  });

  admin.get("/pricing/tiers", async (c) => {
    const db = getDb();
    const { data, error } = await db
      .from("merchant_tiers")
      .select("*")
      .order("sort_order");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ tiers: data ?? [] });
  });

  admin.post("/pricing/tiers", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const slug = String(body.slug || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const commissionRate = Number(body.commission_rate ?? body.commissionRate);
    if (!slug || !name || !Number.isFinite(commissionRate)) {
      return c.json({ error: "slug, name, and commission_rate required" }, 400);
    }

    const db = getDb();
    const { data, error } = await db
      .from("merchant_tiers")
      .insert({
        slug,
        name,
        commission_rate: commissionRate,
        search_boost: Number(body.search_boost ?? body.searchBoost ?? 0),
        default_delivery_radius_km: Number(body.default_delivery_radius_km ?? 8),
        promo_eligible: body.promo_eligible !== false,
        sort_order: Number(body.sort_order ?? 0),
        is_active: body.is_active !== false,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ tier: data }, 201);
  });

  admin.patch("/pricing/tiers/:tierId", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { tierId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name != null) updates.name = String(body.name);
    if (body.commission_rate != null || body.commissionRate != null) {
      updates.commission_rate = Number(body.commission_rate ?? body.commissionRate);
    }
    if (body.search_boost != null || body.searchBoost != null) {
      updates.search_boost = Number(body.search_boost ?? body.searchBoost);
    }
    if (body.default_delivery_radius_km != null) {
      updates.default_delivery_radius_km = Number(body.default_delivery_radius_km);
    }
    if (body.promo_eligible != null) updates.promo_eligible = Boolean(body.promo_eligible);
    if (body.sort_order != null) updates.sort_order = Number(body.sort_order);
    if (body.is_active != null) updates.is_active = Boolean(body.is_active);

    const db = getDb();
    const { data, error } = await db
      .from("merchant_tiers")
      .update(updates)
      .eq("id", tierId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ tier: data });
  });

  admin.post("/pricing/preview", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const merchantId = String(body.merchant_id ?? body.merchantId ?? "");
    const subtotal = Number(body.subtotal ?? 1000);
    const dropoffLat = body.dropoff_lat != null ? Number(body.dropoff_lat) : null;
    const dropoffLng = body.dropoff_lng != null ? Number(body.dropoff_lng) : null;
    const tip = Number(body.tip ?? 0);
    const customerOrderCount = Number(body.customer_order_count ?? 0);

    if (!merchantId) return c.json({ error: "merchant_id required" }, 400);

    const db = getDb();
    const resolved = await resolveDashOrderPricing(db, {
      merchantId,
      subtotal,
      tip,
      dropoffLat,
      dropoffLng,
      customerOrderCount,
    });

    if (!resolved) return c.json({ error: "Could not resolve pricing for merchant" }, 404);

    return c.json({
      breakdown: resolved,
      pricing_v2_enabled: resolved.pricingV2Enabled,
    });
  });

  admin.get("/pricing/audit", async (c) => {
    const db = getDb();
    const marketId = c.req.query("market_id");
    let query = db
      .from("pricing_change_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (marketId) query = query.eq("market_id", marketId);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ entries: data ?? [] });
  });

  admin.get("/pricing/cod/balances", async (c) => {
    const db = getDb();
    const { data, error } = await db
      .from("courier_cash_balances")
      .select("*")
      .order("balance_jmd", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ balances: data ?? [] });
  });

  admin.get("/pricing/cod/events", async (c) => {
    const db = getDb();
    const courierId = c.req.query("courier_id");
    let query = db
      .from("courier_cash_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (courierId) query = query.eq("courier_id", courierId);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ events: data ?? [] });
  });

  admin.post("/pricing/cod/settle", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const courierId = String(body.courier_id ?? body.courierId ?? "");
    const amountJmd = Number(body.amount_jmd ?? body.amountJmd);
    const settlementMethod = String(body.settlement_method ?? body.settlementMethod ?? "manual");
    const notes = body.notes ? String(body.notes) : null;

    if (!courierId || !Number.isFinite(amountJmd) || amountJmd <= 0) {
      return c.json({ error: "courier_id and positive amount_jmd required" }, 400);
    }

    const db = getDb();
    const result = await recordCashSettlement(
      db,
      courierId,
      amountJmd,
      settlementMethod,
      notes,
      adminUser.id,
    );

    await writeKvAudit(
      adminUser,
      "roam_dash.cod_settlement",
      courierId,
      "",
      JSON.stringify({ amount_jmd: amountJmd, settlement_method: settlementMethod }),
    );

    return c.json({ ok: true, balance_after: result.balanceAfter });
  });

  app.route("/admin", admin);
}
