/**
 * Rush Ops admin — pricing & commission configuration.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import {
  flattenNestedToLegacy,
  mergePartyRulesBlob,
  parsePricingRules,
  serializePricingRules,
  validatePartyRules,
  validatePricingConfig,
  validatePricingRules,
  type MerchantTier,
  type PricingParty,
  type PricingRules,
} from "../../_shared/dashPricing.ts";
import { resolveDashOrderPricing } from "../pricingResolver.ts";
import {
  enrichPricingLayers,
  resolvePricingLayers,
  scopeStoredRules,
} from "../pricingLayers.ts";
import { recordCashSettlement } from "../courierCashLedger.ts";
import { computeCodTrialBalance } from "../../_shared/dashPricing.ts";

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

const PRICING_PARTIES: PricingParty[] = ["customer", "rider", "partner", "platform"];

function isPricingParty(v: unknown): v is PricingParty {
  return typeof v === "string" && PRICING_PARTIES.includes(v as PricingParty);
}

function rowToMerchantTier(row: Record<string, unknown>): MerchantTier {
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    commissionRate: Number(row.commission_rate ?? 0),
    searchBoost: row.search_boost != null ? Number(row.search_boost) : undefined,
    defaultDeliveryRadiusKm: row.default_delivery_radius_km != null
      ? Number(row.default_delivery_radius_km)
      : undefined,
    promoEligible: row.promo_eligible != null ? Boolean(row.promo_eligible) : undefined,
    autoAds: row.auto_ads != null ? Boolean(row.auto_ads) : undefined,
  };
}

async function loadActiveTiers(
  db: ReturnType<typeof getDb>,
): Promise<MerchantTier[]> {
  const { data } = await db
    .from("merchant_tiers")
    .select("slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, auto_ads")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((row) => rowToMerchantTier(row as Record<string, unknown>));
}

async function assertValidPricingConfig(
  db: ReturnType<typeof getDb>,
  rules: PricingRules,
  tiersOverride?: MerchantTier[],
): Promise<{ error: string; code: string } | null> {
  const tiers = tiersOverride ?? await loadActiveTiers(db);
  const err = validatePricingConfig(rules, tiers);
  if (!err) return null;
  return { error: err.message, code: err.code };
}

async function loadActiveProfileRules(opts: {
  db: ReturnType<typeof getDb>;
  table: "global_pricing_profiles" | "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn?: "parish_id" | "market_id";
  matchId?: string;
}): Promise<Record<string, unknown>> {
  const { db, table, matchColumn, matchId } = opts;
  let query = db.from(table).select("rules").eq("is_active", true);
  if (matchColumn && matchId) query = query.eq(matchColumn, matchId);
  const { data } = await query.order("version", { ascending: false }).limit(1).maybeSingle();
  return ((data?.rules ?? {}) as Record<string, unknown>);
}

/** Apply full or party-scoped rules update; returns serialized blob or error. */
async function prepareRulesForSave(opts: {
  db: ReturnType<typeof getDb>;
  table: "global_pricing_profiles" | "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn?: "parish_id" | "market_id";
  matchId?: string;
  body: Record<string, unknown>;
}): Promise<
  | { serialized: Record<string, unknown>; parsed: PricingRules; party?: PricingParty }
  | { error: string; status: number; code?: string }
> {
  const body = opts.body;
  const partyRaw = body.party;
  const party = isPricingParty(partyRaw) ? partyRaw : undefined;
  const incomingRules = (
    party && body.rules != null
      ? body.rules
      : body.rules ?? body
  ) as Record<string, unknown>;

  let mergedRaw: Record<string, unknown>;
  if (party) {
    const current = await loadActiveProfileRules(opts);
    mergedRaw = flattenNestedToLegacy(mergePartyRulesBlob(current, party, incomingRules));
    // Root-level Growth Guarantee knobs (saved from Platform party form)
    if (incomingRules.growth_guarantee && typeof incomingRules.growth_guarantee === "object") {
      mergedRaw = {
        ...mergedRaw,
        growth_guarantee: incomingRules.growth_guarantee as Record<string, unknown>,
      };
    }
  } else {
    mergedRaw = incomingRules;
  }

  const parsed = parsePricingRules(mergedRaw);
  const validationError = party
    ? validatePartyRules(party, parsed)
    : validatePricingRules(parsed);
  if (validationError) return { error: validationError, status: 400 };

  const configErr = await assertValidPricingConfig(opts.db, parsed);
  if (configErr) {
    return { error: `${configErr.code}: ${configErr.error}`, status: 400, code: configErr.code };
  }

  return {
    serialized: party ? mergedRaw : serializePricingRules(parsed),
    parsed,
    party,
  };
}

function layerJsonResponse(
  scope: "global" | "parish" | "market",
  layered: Awaited<ReturnType<typeof resolvePricingLayers>>,
  extra: Record<string, unknown> = {},
) {
  const enrichment = enrichPricingLayers(layered);
  return {
    scope,
    rules: scopeStoredRules(layered, scope),
    effective_rules: enrichment.effective_rules,
    resolved: enrichment.resolved,
    provenance: enrichment.provenance,
    ...extra,
  };
}

async function writeVersionedProfile(opts: {
  db: ReturnType<typeof getDb>;
  table: "global_pricing_profiles" | "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn?: "parish_id" | "market_id";
  matchId?: string;
  rules: Record<string, unknown>;
  adminUser: ProductAdminUser;
}) {
  const { db, table, matchColumn, matchId, rules, adminUser } = opts;
  let currentQuery = db.from(table).select("*").eq("is_active", true);
  if (matchColumn && matchId) currentQuery = currentQuery.eq(matchColumn, matchId);
  const { data: current } = await currentQuery
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = current ? Number(current.version ?? 0) + 1 : 1;
  if (current) {
    await db
      .from(table)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", current.id);
  }

  const insertRow: Record<string, unknown> = {
    version: nextVersion,
    is_active: true,
    rules,
    created_by: adminUser.id,
  };
  if (table !== "global_pricing_profiles") {
    insertRow.override_enabled = current?.override_enabled !== false;
  }
  if (matchColumn && matchId) insertRow[matchColumn] = matchId;

  const { data: created, error } = await db.from(table).insert(insertRow).select().single();
  return { current, created, error, nextVersion };
}

async function clearVersionedProfile(opts: {
  db: ReturnType<typeof getDb>;
  table: "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn: "parish_id" | "market_id";
  matchId: string;
}) {
  const { db, table, matchColumn, matchId } = opts;
  const { data: current } = await db
    .from(table)
    .select("*")
    .eq(matchColumn, matchId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!current) return { current: null };
  await db
    .from(table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", current.id);
  return { current };
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
    const [
      { data: markets },
      { data: parishes },
      { data: tiers },
      { data: profiles },
      { data: parishProfiles },
      { data: globalProfiles },
    ] = await Promise.all([
      db.from("service_markets")
        .select("id, slug, name, is_active, parish_id")
        .order("name"),
      db.from("service_parishes")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      db.from("merchant_tiers").select("*").order("sort_order"),
      db.from("market_pricing_profiles")
        .select("id, market_id, version, is_active, override_enabled, rules, effective_from, updated_at")
        .eq("is_active", true),
      db.from("parish_pricing_profiles")
        .select("id, parish_id, version, is_active, override_enabled")
        .eq("is_active", true),
      db.from("global_pricing_profiles")
        .select("id, version, is_active")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1),
    ]);

    const parishById = new Map(
      (parishes ?? []).map((p: Record<string, unknown>) => [String(p.id), p]),
    );
    const profileByMarket = new Map(
      (profiles ?? []).map((p: Record<string, unknown>) => [String(p.market_id), p]),
    );
    const parishOverrideById = new Map(
      (parishProfiles ?? []).map((p: Record<string, unknown>) => [String(p.parish_id), p]),
    );

    const marketSummaries = (markets ?? []).map((m: Record<string, unknown>) => {
      const profile = profileByMarket.get(String(m.id));
      const parishId = m.parish_id != null ? String(m.parish_id) : null;
      const parish = parishId ? parishById.get(parishId) : null;
      return {
        market: {
          id: m.id,
          slug: m.slug,
          name: m.name,
          is_active: m.is_active,
          parish_id: parishId,
        },
        parish: parish
          ? {
            id: String(parish.id),
            name: String(parish.name),
            sort_order: Number(parish.sort_order ?? 0),
          }
          : null,
        profile: profile ?? null,
        has_town_override: Boolean(profile),
        town_override_enabled: profile ? profile.override_enabled !== false : false,
      };
    });

    const parishSummaries = (parishes ?? []).map((p: Record<string, unknown>) => {
      const override = parishOverrideById.get(String(p.id));
      return {
        id: String(p.id),
        name: String(p.name),
        sort_order: Number(p.sort_order ?? 0),
        has_override: Boolean(override),
        override_enabled: override ? override.override_enabled !== false : false,
      };
    });

    const { data: tierCounts } = await db
      .from("merchants")
      .select("pricing_tier_id")
      .not("pricing_tier_id", "is", null);

    const merchantsByTier = new Map<string, number>();
    for (const row of tierCounts ?? []) {
      const tid = String((row as Record<string, unknown>).pricing_tier_id);
      merchantsByTier.set(tid, (merchantsByTier.get(tid) ?? 0) + 1);
    }

    const tiersWithCounts = (tiers ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      merchant_count: merchantsByTier.get(String(t.id)) ?? 0,
    }));

    const { data: revenueRows } = await db
      .from("orders")
      .select(
        "merchant_commission_amount, service_fee, subtotal, total, contribution_jmd, pricing_snapshot, rush_pass_membership_id",
      )
      .not("status", "in", '("cancelled")');

    let orderCount = 0;
    let commissionTotal = 0;
    let serviceFeeTotal = 0;
    let contributionTotal = 0;
    let grossFood = 0;
    let passOrders = 0;
    let passSubsidyTotal = 0;
    let distanceFeeOrders = 0;
    let distanceFeeTotal = 0;
    for (const o of revenueRows ?? []) {
      const row = o as Record<string, unknown>;
      orderCount++;
      commissionTotal += Number(row.merchant_commission_amount ?? 0);
      serviceFeeTotal += Number(row.service_fee ?? 0);
      contributionTotal += Number(row.contribution_jmd ?? 0);
      grossFood += Number(row.subtotal ?? 0);
      const snap = (row.pricing_snapshot ?? {}) as Record<string, unknown>;
      const passApplied = row.rush_pass_membership_id != null ||
        snap.rush_pass_applied === true ||
        snap.rushPassApplied === true;
      if (passApplied) {
        passOrders++;
        passSubsidyTotal += Number(
          snap.platform_delivery_subsidy_jmd ??
            snap.platformDeliverySubsidyJmd ??
            snap.promo_cost_jmd ??
            snap.promoCostJmd ??
            0,
        );
      }
      const distFee = Number(
        snap.service_fee_distance_jmd ?? snap.serviceFeeDistanceJmd ?? 0,
      );
      if (distFee > 0) {
        distanceFeeOrders++;
        distanceFeeTotal += distFee;
      }
    }
    const takeRate = grossFood > 0
      ? Math.round((commissionTotal / grossFood) * 1000) / 10
      : 0;

    // Growth Guarantee credits (all time + last 90 days)
    const paymentsDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "payments" } },
    );
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: ggRows } = await paymentsDb
      .from("merchant_adjustments")
      .select("amount_jmd, created_at, idempotency_key")
      .like("idempotency_key", "gg:%")
      .gte("created_at", since90);

    let ggCreditCount = 0;
    let ggCreditTotal = 0;
    for (const g of ggRows ?? []) {
      ggCreditCount++;
      ggCreditTotal += Number((g as { amount_jmd?: number }).amount_jmd ?? 0);
    }

    const { count: activePassCount } = await db
      .from("rush_pass_memberships")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString());

    const { data: recentChanges } = await db
      .from("pricing_change_log")
      .select("id, scope, created_at, created_by, market_id")
      .order("created_at", { ascending: false })
      .limit(5);

    return c.json({
      markets: marketSummaries,
      parishes: parishSummaries,
      global: globalProfiles?.[0]
        ? { id: globalProfiles[0].id, version: globalProfiles[0].version, has_override: true }
        : null,
      tiers: tiersWithCounts,
      revenue: {
        order_count: orderCount,
        v2_order_count: orderCount,
        commission_total_jmd: Math.round(commissionTotal * 100) / 100,
        service_fee_total_jmd: Math.round(serviceFeeTotal * 100) / 100,
        contribution_total_jmd: Math.round(contributionTotal * 100) / 100,
        gross_food_jmd: Math.round(grossFood * 100) / 100,
        take_rate_percent: takeRate,
        rush_pass_order_count: passOrders,
        rush_pass_attach_rate_percent: orderCount > 0
          ? Math.round((passOrders / orderCount) * 1000) / 10
          : 0,
        rush_pass_subsidy_total_jmd: Math.round(passSubsidyTotal * 100) / 100,
        rush_pass_active_memberships: activePassCount ?? 0,
        distance_fee_order_count: distanceFeeOrders,
        distance_fee_attach_rate_percent: orderCount > 0
          ? Math.round((distanceFeeOrders / orderCount) * 1000) / 10
          : 0,
        distance_fee_total_jmd: Math.round(distanceFeeTotal * 100) / 100,
        growth_guarantee_credit_count_90d: ggCreditCount,
        growth_guarantee_credit_total_jmd_90d: Math.round(ggCreditTotal * 100) / 100,
      },
      recent_changes: recentChanges ?? [],
    });
  });

  admin.get("/pricing/defaults", async (c) => {
    const db = getDb();
    const layered = await resolvePricingLayers(db, {});
    return c.json(layerJsonResponse("global", layered, {
      profile: layered.layers.global,
      has_override: Boolean(layered.layers.global),
      stack: ["Default"],
    }));
  });

  admin.put("/pricing/defaults", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const prepared = await prepareRulesForSave({
      db,
      table: "global_pricing_profiles",
      body: body as Record<string, unknown>,
    });
    if ("error" in prepared) {
      return c.json(
        { error: prepared.error, ...(prepared.code ? { code: prepared.code } : {}) },
        prepared.status,
      );
    }

    const { serialized, parsed, party } = prepared;

    const { current, created, error, nextVersion } = await writeVersionedProfile({
      db,
      table: "global_pricing_profiles",
      rules: serialized,
      adminUser,
    });
    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      scope: "global",
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "global_pricing_updated",
      before_state: current ? { version: current.version, rules: current.rules } : null,
      after_state: {
        version: nextVersion,
        rules: serialized,
        party: party ?? "all",
      },
    });
    await writeKvAudit(
      adminUser,
      "roam_dash.pricing_defaults_updated",
      String(created?.id ?? ""),
      "",
      JSON.stringify({ version: nextVersion }),
    );
    return c.json({ profile: created, rules: serializePricingRules(parsed) });
  });

  admin.get("/pricing/parishes/:parishId", async (c) => {
    const { parishId } = c.req.param();
    const db = getDb();
    const { data: parish } = await db
      .from("service_parishes")
      .select("id, name, sort_order")
      .eq("id", parishId)
      .maybeSingle();
    if (!parish) return c.json({ error: "Parish not found" }, 404);

    const layered = await resolvePricingLayers(db, { parishId });
    return c.json(layerJsonResponse("parish", layered, {
      parish,
      profile: layered.layers.parish,
      has_override: layered.layers.parish?.hasOverride === true,
      override_enabled: layered.layers.parish?.overrideEnabled === true,
      stack: [
        "Default",
        layered.layers.parish?.hasOverride && layered.layers.parish.overrideEnabled
          ? String(parish.name)
          : null,
      ].filter(Boolean),
    }));
  });

  admin.patch("/pricing/parishes/:parishId/override-enabled", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { parishId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const nextEnabled = Boolean(body.enabled ?? body.override_enabled);
    const db = getDb();
    const { data: current } = await db
      .from("parish_pricing_profiles")
      .select("id, override_enabled")
      .eq("parish_id", parishId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!current) return c.json({ error: "No parish override to toggle" }, 404);

    const { error } = await db
      .from("parish_pricing_profiles")
      .update({
        override_enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      scope: "parish",
      parish_id: parishId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: nextEnabled ? "parish_pricing_enabled" : "parish_pricing_disabled",
      before_state: { override_enabled: current.override_enabled !== false },
      after_state: { override_enabled: nextEnabled },
    });

    return c.json({ ok: true, override_enabled: nextEnabled });
  });

  admin.put("/pricing/parishes/:parishId", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { parishId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const { data: parish } = await db
      .from("service_parishes")
      .select("id, name")
      .eq("id", parishId)
      .maybeSingle();
    if (!parish) return c.json({ error: "Parish not found" }, 404);

    const incomingBody = body as Record<string, unknown>;
    const prepared = await prepareRulesForSave({
      db,
      table: "parish_pricing_profiles",
      matchColumn: "parish_id",
      matchId: parishId,
      body: incomingBody,
    });
    if ("error" in prepared) {
      return c.json(
        { error: prepared.error, ...(prepared.code ? { code: prepared.code } : {}) },
        prepared.status,
      );
    }

    const { serialized, parsed, party } = prepared;

    const { current, created, error, nextVersion } = await writeVersionedProfile({
      db,
      table: "parish_pricing_profiles",
      matchColumn: "parish_id",
      matchId: parishId,
      rules: serialized,
      adminUser,
    });
    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      scope: "parish",
      parish_id: parishId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "parish_pricing_updated",
      before_state: current ? { version: current.version, rules: current.rules } : null,
      after_state: {
        version: nextVersion,
        rules: serialized,
        party: party ?? "all",
      },
    });
    await writeKvAudit(
      adminUser,
      "roam_dash.pricing_parish_updated",
      parishId,
      "",
      JSON.stringify({ version: nextVersion, parish: parish.name }),
    );
    return c.json({ profile: created, rules: serializePricingRules(parsed) });
  });

  admin.delete("/pricing/parishes/:parishId", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { parishId } = c.req.param();
    const db = getDb();
    const { current } = await clearVersionedProfile({
      db,
      table: "parish_pricing_profiles",
      matchColumn: "parish_id",
      matchId: parishId,
    });
    if (!current) return c.json({ ok: true, cleared: false });

    await db.from("pricing_change_log").insert({
      scope: "parish",
      parish_id: parishId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "parish_pricing_cleared",
      before_state: { version: current.version, rules: current.rules },
      after_state: null,
    });
    return c.json({ ok: true, cleared: true });
  });

  /** Bulk-clear town overrides — used to remove seeded/unused profiles. */
  admin.post("/pricing/markets/clear-overrides", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    let marketIds = Array.isArray(body.market_ids)
      ? body.market_ids.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (body.inactive_only === true) {
      const { data: inactive } = await db
        .from("service_markets")
        .select("id")
        .eq("is_active", false);
      marketIds = (inactive ?? []).map((m: { id: string }) => String(m.id));
    }

    if (marketIds.length === 0) {
      return c.json({ ok: true, cleared: 0, market_ids: [] });
    }

    let cleared = 0;
    for (const marketId of marketIds) {
      const { current } = await clearVersionedProfile({
        db,
        table: "market_pricing_profiles",
        matchColumn: "market_id",
        matchId: marketId,
      });
      if (!current) continue;
      cleared += 1;
      await db.from("pricing_change_log").insert({
        scope: "market",
        market_id: marketId,
        actor_id: adminUser.id,
        actor_email: adminUser.email,
        action: "market_pricing_cleared_bulk",
        before_state: { version: current.version, rules: current.rules },
        after_state: null,
      });
    }

    await writeKvAudit(
      adminUser,
      "roam_dash.pricing_town_overrides_cleared",
      "",
      "",
      JSON.stringify({ cleared, inactive_only: body.inactive_only === true }),
    );

    return c.json({ ok: true, cleared, market_ids: marketIds });
  });

  admin.get("/pricing/markets/:marketId", async (c) => {
    const { marketId } = c.req.param();
    const db = getDb();
    const { data: market } = await db
      .from("service_markets")
      .select("id, slug, name, is_active, parish_id")
      .eq("id", marketId)
      .maybeSingle();
    if (!market) return c.json({ error: "Market not found" }, 404);

    const layered = await resolvePricingLayers(db, { marketId });
    const parishName = layered.parishId
      ? (await db.from("service_parishes").select("name").eq("id", layered.parishId).maybeSingle())
        .data?.name
      : null;

    return c.json(layerJsonResponse("market", layered, {
      market,
      profile: layered.layers.market,
      has_override: layered.layers.market?.hasOverride === true,
      override_enabled: layered.layers.market?.overrideEnabled === true,
      has_parish_override: layered.layers.parish?.hasOverride === true,
      stack: [
        "Default",
        layered.layers.parish?.hasOverride && layered.layers.parish.overrideEnabled
          ? String(parishName ?? "Parish")
          : null,
        layered.layers.market?.hasOverride && layered.layers.market.overrideEnabled
          ? String(market.name)
          : null,
      ].filter(Boolean),
    }));
  });

  admin.patch("/pricing/markets/:marketId/override-enabled", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { marketId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const nextEnabled = Boolean(body.enabled ?? body.override_enabled);
    const db = getDb();
    const { data: current } = await db
      .from("market_pricing_profiles")
      .select("id, override_enabled")
      .eq("market_id", marketId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!current) return c.json({ error: "No town override to toggle" }, 404);

    const { error } = await db
      .from("market_pricing_profiles")
      .update({
        override_enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      scope: "market",
      market_id: marketId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: nextEnabled ? "market_pricing_enabled" : "market_pricing_disabled",
      before_state: { override_enabled: current.override_enabled !== false },
      after_state: { override_enabled: nextEnabled },
    });

    return c.json({ ok: true, override_enabled: nextEnabled });
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

    const prepared = await prepareRulesForSave({
      db,
      table: "market_pricing_profiles",
      matchColumn: "market_id",
      matchId: marketId,
      body: body as Record<string, unknown>,
    });
    if ("error" in prepared) {
      return c.json(
        { error: prepared.error, ...(prepared.code ? { code: prepared.code } : {}) },
        prepared.status,
      );
    }

    const { serialized, parsed, party } = prepared;

    const { current, created, error, nextVersion } = await writeVersionedProfile({
      db,
      table: "market_pricing_profiles",
      matchColumn: "market_id",
      matchId: marketId,
      rules: serialized,
      adminUser,
    });
    if (error) return c.json({ error: error.message }, 500);

    await db.from("pricing_change_log").insert({
      scope: "market",
      market_id: marketId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "market_pricing_updated",
      before_state: current ? { version: current.version, rules: current.rules } : null,
      after_state: {
        version: nextVersion,
        rules: serialized,
        party: party ?? "all",
      },
    });

    await writeKvAudit(
      adminUser,
      "roam_dash.pricing_market_updated",
      marketId,
      "",
      JSON.stringify({ version: nextVersion, market_slug: market.slug }),
    );

    return c.json({ profile: created, rules: serializePricingRules(parsed) });
  });

  admin.delete("/pricing/markets/:marketId", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const { marketId } = c.req.param();
    const db = getDb();
    const { current } = await clearVersionedProfile({
      db,
      table: "market_pricing_profiles",
      matchColumn: "market_id",
      matchId: marketId,
    });
    if (!current) return c.json({ ok: true, cleared: false });

    await db.from("pricing_change_log").insert({
      scope: "market",
      market_id: marketId,
      actor_id: adminUser.id,
      actor_email: adminUser.email,
      action: "market_pricing_cleared",
      before_state: { version: current.version, rules: current.rules },
      after_state: null,
    });
    return c.json({ ok: true, cleared: true });
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
    const insertRow: Record<string, unknown> = {
      slug,
      name,
      commission_rate: commissionRate,
      search_boost: Number(body.search_boost ?? body.searchBoost ?? 0),
      default_delivery_radius_km: Number(
        body.default_delivery_radius_km ?? body.defaultDeliveryRadiusKm ?? 8,
      ),
      promo_eligible: (body.promo_eligible ?? body.promoEligible) !== false,
      auto_ads: Boolean(body.auto_ads ?? body.autoAds ?? false),
      sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
      is_active: (body.is_active ?? body.isActive) !== false,
    };

    const existingTiers = await loadActiveTiers(db);
    const candidateTiers = [
      ...existingTiers.filter((t) => t.slug !== slug),
      ...(insertRow.is_active !== false ? [rowToMerchantTier(insertRow)] : []),
    ];
    const layered = await resolvePricingLayers(db, {});
    const configErr = await assertValidPricingConfig(db, layered.rules, candidateTiers);
    if (configErr) {
      return c.json({ error: configErr.error, code: configErr.code }, 400);
    }

    const { data, error } = await db
      .from("merchant_tiers")
      .insert(insertRow)
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
    if (body.default_delivery_radius_km != null || body.defaultDeliveryRadiusKm != null) {
      updates.default_delivery_radius_km = Number(
        body.default_delivery_radius_km ?? body.defaultDeliveryRadiusKm,
      );
    }
    if (body.promo_eligible != null || body.promoEligible != null) {
      updates.promo_eligible = Boolean(body.promo_eligible ?? body.promoEligible);
    }
    if (body.auto_ads != null || body.autoAds != null) {
      updates.auto_ads = Boolean(body.auto_ads ?? body.autoAds);
    }
    if (body.sort_order != null || body.sortOrder != null) {
      updates.sort_order = Number(body.sort_order ?? body.sortOrder);
    }
    if (body.is_active != null || body.isActive != null) {
      updates.is_active = Boolean(body.is_active ?? body.isActive);
    }

    const db = getDb();
    const { data: currentTier } = await db
      .from("merchant_tiers")
      .select("slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, auto_ads, is_active")
      .eq("id", tierId)
      .maybeSingle();
    if (!currentTier) return c.json({ error: "Tier not found" }, 404);

    const { data: allTiers } = await db
      .from("merchant_tiers")
      .select("id, slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, auto_ads, is_active")
      .order("sort_order");
    const candidateTiers = (allTiers ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        if (String(r.id) === tierId) {
          const merged = { ...r, ...updates };
          if (merged.is_active === false) return null;
          return rowToMerchantTier(merged);
        }
        if (r.is_active === false) return null;
        return rowToMerchantTier(r);
      })
      .filter((t): t is MerchantTier => t != null);

    const layered = await resolvePricingLayers(db, {});
    const configErr = await assertValidPricingConfig(db, layered.rules, candidateTiers);
    if (configErr) {
      return c.json({ error: configErr.error, code: configErr.code }, 400);
    }

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
    const merchantIdRaw = String(body.merchant_id ?? body.merchantId ?? "").trim();
    const merchantId = merchantIdRaw || null;
    const subtotal = Number(body.subtotal ?? 1000);
    const dropoffLat = body.dropoff_lat != null ? Number(body.dropoff_lat) : null;
    const dropoffLng = body.dropoff_lng != null ? Number(body.dropoff_lng) : null;
    const pickupLat = body.pickup_lat != null || body.pickupLat != null
      ? Number(body.pickup_lat ?? body.pickupLat)
      : null;
    const pickupLng = body.pickup_lng != null || body.pickupLng != null
      ? Number(body.pickup_lng ?? body.pickupLng)
      : null;
    const tip = Number(body.tip ?? 0);
    const marketIdOverride = body.market_id != null || body.marketId != null
      ? String(body.market_id ?? body.marketId)
      : null;
    const paymentRaw = String(body.payment_method ?? body.paymentMethod ?? "wipay");
    const paymentMethod = paymentRaw === "cash" ? "cash" : "wipay";
    const customerOrderCount = body.customer_order_count != null || body.customerOrderCount != null
      ? Number(body.customer_order_count ?? body.customerOrderCount)
      : null;
    const freeDelivery = body.free_delivery === true || body.freeDelivery === true
      ? true
      : body.free_delivery === false || body.freeDelivery === false
      ? false
      : undefined;
    const simulateRushPass = body.rush_pass === true || body.rushPass === true ||
      body.simulate_rush_pass === true || body.simulateRushPass === true;
    const distanceKmOverride = body.distance_km != null || body.distanceKm != null
      ? Number(body.distance_km ?? body.distanceKm)
      : null;
    const tierIdOverride = body.tier_id != null || body.tierId != null
      ? String(body.tier_id ?? body.tierId)
      : null;
    const gctRegistered = body.gct_registered === false || body.gctRegistered === false
      ? false
      : body.gct_registered === true || body.gctRegistered === true
      ? true
      : merchantId
      ? null
      : true;
    // Statutory rate from Accounting GCT engine only — ignore body tax_rate_percent
    let taxRatePercent: number | null = null;
    try {
      const { loadGlobalGctConfig } = await import("../../_shared/gctRate.ts");
      const gctCfg = await loadGlobalGctConfig(getDb() as never);
      taxRatePercent = gctCfg.ratePercent;
    } catch {
      taxRatePercent = null;
    }

    // Merchant path OR standalone calculator (pickup + tier)
    if (!merchantId) {
      if (pickupLat == null || !Number.isFinite(pickupLat) || pickupLng == null || !Number.isFinite(pickupLng)) {
        return c.json({ error: "pickup_lat and pickup_lng required when merchant_id is omitted" }, 400);
      }
      if (!tierIdOverride) {
        return c.json({ error: "tier_id required when merchant_id is omitted" }, 400);
      }
    }

    try {
      const db = getDb();
      const resolved = await resolveDashOrderPricing(db, {
        merchantId,
        subtotal,
        tip,
        dropoffLat,
        dropoffLng,
        pickupLat,
        pickupLng,
        paymentMethod,
        marketIdOverride,
        customerOrderCount: Number.isFinite(customerOrderCount as number)
          ? (customerOrderCount as number)
          : null,
        freeDelivery,
        simulateRushPass,
        distanceKmOverride: Number.isFinite(distanceKmOverride as number)
          ? (distanceKmOverride as number)
          : null,
        requireCoverage: false,
        tierIdOverride,
        gctRegistered,
        taxRatePercent: Number.isFinite(taxRatePercent as number) ? taxRatePercent : null,
      });

      if (!resolved) {
        return c.json({
          error: merchantId
            ? "Restaurant not found or could not load pricing. Pick another restaurant and try again."
            : "Could not resolve standalone pricing. Check store pin and tier.",
          code: "pricing_unresolved",
        }, 404);
      }

      const effectiveMarketId = resolved.resolvedMarketId ?? resolved.marketId ?? null;
      const layered = effectiveMarketId
        ? await resolvePricingLayers(db, { marketId: effectiveMarketId })
        : await resolvePricingLayers(db, {});
      const partyRules = enrichPricingLayers(layered);

      return c.json({
        breakdown: resolved,
        market_id: resolved.marketId,
        resolved_market_id: resolved.resolvedMarketId ?? null,
        covered: resolved.covered ?? null,
        coverage: resolved.coverage ?? null,
        market_override_applied: resolved.marketOverrideApplied ?? false,
        party_rules: {
          resolved: partyRules.resolved,
          provenance: partyRules.provenance,
          stack: [
            "Default",
            layered.layers.parish?.hasOverride && layered.layers.parish.overrideEnabled
              ? "Parish"
              : null,
            layered.layers.market?.hasOverride && layered.layers.market.overrideEnabled
              ? "Town"
              : null,
          ].filter(Boolean),
        },
      });
    } catch (e) {
      console.error("[pricing/preview]", e);
      return c.json({
        error: e instanceof Error ? e.message : "Pricing preview failed",
        code: "pricing_preview_error",
      }, 500);
    }
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

  /** Replay historical orders against current rules (UX-9 backtest). */
  admin.get("/pricing/backtest", async (c) => {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 28)));
    const { data: orders, error } = await db
      .from("orders")
      .select(
        "id, subtotal, discount, tip, total, delivery_lat, delivery_lng, merchant_id, merchant_commission_amount, service_fee, contribution_jmd",
      )
      .not("status", "in", '("cancelled")')
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return c.json({ error: error.message }, 500);

    const rows = [];
    for (const o of orders ?? []) {
      const order = o as Record<string, unknown>;
      const merchantId = String(order.merchant_id ?? "");
      if (!merchantId) continue;
      try {
        const replay = await resolveDashOrderPricing(db, {
          merchantId,
          subtotal: Number(order.subtotal ?? 0),
          discount: Number(order.discount ?? 0),
          tip: Number(order.tip ?? 0),
          dropoffLat: order.delivery_lat != null ? Number(order.delivery_lat) : null,
          dropoffLng: order.delivery_lng != null ? Number(order.delivery_lng) : null,
          paymentMethod: "cash",
          requireCoverage: false,
        });
        if (!replay) continue;
        const recordedTotal = Number(order.total ?? 0);
        rows.push({
          order_id: order.id,
          recorded_total: recordedTotal,
          replay_total: replay.customerTotal,
          delta_jmd: Math.round((replay.customerTotal - recordedTotal) * 100) / 100,
          recorded_commission: Number(order.merchant_commission_amount ?? 0),
          replay_commission: replay.merchantCommissionAmount,
          recorded_service_fee: Number(order.service_fee ?? 0),
          replay_service_fee: replay.serviceFee,
          recorded_contribution: Number(order.contribution_jmd ?? 0),
          replay_contribution: replay.contributionJmd,
        });
      } catch {
        // skip unrunnable rows
      }
    }
    return c.json({ rows, count: rows.length });
  });

  /** Nightly-style reconciliation — snapshot vs columns vs ledger (GAP-10). */
  admin.get("/pricing/reconciliation", async (c) => {
    const db = getDb();
    const { data: recentOrders, error } = await db
      .from("orders")
      .select("*")
      .not("status", "in", '("cancelled")')
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);

    const violations: Array<Record<string, unknown>> = [];
    for (const o of recentOrders ?? []) {
      const order = o as Record<string, unknown>;
      try {
        const balance = computeCodTrialBalance({
          subtotal: Number(order.subtotal ?? 0),
          discount: Number(order.discount ?? 0),
          merchantCommissionAmount: Number(order.merchant_commission_amount ?? 0),
          serviceFee: Number(order.service_fee ?? 0),
          deliveryFeePlatformAmount: Number(order.delivery_fee_platform_amount ?? 0),
          deliveryFeeCourierAmount: Number(order.delivery_fee_courier_amount ?? 0),
          taxFoodJmd: Number(order.tax_food_jmd ?? 0),
          taxPlatformJmd: Number(order.tax_platform_jmd ?? 0),
          tax: Number(order.tax ?? 0),
          tip: Number(order.tip ?? 0),
          courierTipNet: order.courier_tip_net != null ? Number(order.courier_tip_net) : undefined,
          total: Number(order.total ?? 0),
          smallOrderFee: Number(order.small_order_fee ?? 0),
        });
        const sum = Math.round(
          (balance.platformDueJmd + balance.merchantDueJmd + balance.courierRetainedJmd) * 100,
        ) / 100;
        const total = Math.round(Number(order.total ?? 0) * 100) / 100;
        if (Math.abs(sum - total) > 0.02) {
          violations.push({
            order_id: order.id,
            expected_total: total,
            computed_sum: sum,
            balance,
          });
        }
      } catch (e) {
        violations.push({
          order_id: order.id,
          error: e instanceof Error ? e.message : "balance_error",
        });
      }
    }
    return c.json({
      orders_checked: (recentOrders ?? []).length,
      violation_count: violations.length,
      violations,
    });
  });

  // Phase 2 — Growth Guarantee monthly credit run (admin or cron with product admin JWT)
  admin.post("/pricing/growth-guarantee/run", async (c) => {
    const adminUser = adminFromCtx(c);
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({})) as { period?: string };
    const { priorJamaicaPeriodYyyyMm, runGrowthGuaranteeForPeriod } = await import(
      "../growthGuarantee.ts"
    );
    const period = String(body.period || priorJamaicaPeriodYyyyMm()).trim();
    try {
      const result = await runGrowthGuaranteeForPeriod(getDb(), period);
      await writeKvAudit(
        adminUser,
        "roam_dash.growth_guarantee_run",
        period,
        "",
        JSON.stringify({
          evaluated: result.evaluated,
          credited: result.credited,
          skipped: result.skipped,
        }),
      );
      return c.json(result);
    } catch (e) {
      return c.json({
        error: e instanceof Error ? e.message : "growth_guarantee_failed",
      }, 500);
    }
  });

  admin.get("/pricing/merchants/commission", async (c) => {
    const db = getDb();
    const { data, error } = await db
      .from("merchants")
      .select("id, name, slug, pricing_tier_id")
      .eq("is_active", true)
      .order("name");
    if (error) return c.json({ error: error.message }, 500);

    const { data: orders } = await db
      .from("orders")
      .select("merchant_id, merchant_commission_amount, subtotal")
      .not("status", "in", '("cancelled")');

    const agg = new Map<string, { commission: number; food: number; orders: number }>();
    for (const o of orders ?? []) {
      const row = o as Record<string, unknown>;
      const mid = String(row.merchant_id ?? "");
      if (!mid) continue;
      const cur = agg.get(mid) ?? { commission: 0, food: 0, orders: 0 };
      cur.commission += Number(row.merchant_commission_amount ?? 0);
      cur.food += Number(row.subtotal ?? 0);
      cur.orders += 1;
      agg.set(mid, cur);
    }

    const rows = (data ?? []).map((m: Record<string, unknown>) => {
      const id = String(m.id);
      const stats = agg.get(id) ?? { commission: 0, food: 0, orders: 0 };
      return {
        merchant_id: id,
        name: m.name,
        slug: m.slug,
        tier_id: m.pricing_tier_id,
        order_count: stats.orders,
        v2_order_count: stats.orders,
        commission_total_jmd: Math.round(stats.commission * 100) / 100,
        gross_food_jmd: Math.round(stats.food * 100) / 100,
      };
    });
    return c.json({ merchants: rows });
  });

  app.route("/admin", admin);
}
