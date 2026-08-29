/**
 * Roam Rush - Delivery Service
 * 
 * Handles all delivery/food ordering operations:
 * - Merchant management
 * - Menu management
 * - Order lifecycle
 * - Courier assignment
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyCors } from "../_shared/corsAllowlist.ts";
import { jwtPrimaryRole } from "../_shared/authEdge.ts";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { resolveMerchantAccess, requireResolvedMerchantWithPermission, requireMerchantPermission, type TeamPermission, isMerchantOwnerSuspended, OWNER_ACCOUNT_SUSPENDED } from "./merchantAuth.ts";
import {
  registerMerchantTeamRoutes,
  getPendingTeamInviteForProfile,
} from "./merchantTeam.ts";
import {
  registerMerchantStationRoutes,
  resolveEnrolledDevice,
  resolveShiftTokenFromRequest,
} from "./merchantStationRoutes.ts";
import { registerMerchantVenueOpsRoutes } from "./merchantVenueOps.ts";
import {
  feeRateToPercent,
  resolveFeeRateForMerchant,
} from "./platformFeeRate.ts";
import {
  inStoreStatusTransitions,
  registerMerchantRestaurantRoutes,
  roamStatusTransitions,
} from "./merchantRestaurantRoutes.ts";
import { assertMerchantAcceptingOrders } from "./merchantOpenCheck.ts";
import { registerMerchantInventoryRoutes } from "./merchantInventoryRoutes.ts";
import { registerCustomerOrderRoutes } from "./customerOrderRoutes.ts";
import { registerCustomerAccountRoutes } from "./customerAccountRoutes.ts";
import { registerCustomerDiscoveryRoutes } from "./customerDiscoveryRoutes.ts";
import {
  registerCourierConsumerRoutes,
  requireActiveCourier,
  COURIER_TRANSITIONS,
  dispatchOffersForOrder,
  applyCancelCompensation,
  completeStackLeg,
} from "./courierConsumerRoutes.ts";
import { registerDashHealthRoutes } from "./dashHealthRoutes.ts";
import { registerStripeConnectRoutes } from "./stripeConnectRoutes.ts";
import { notifyCustomerOrderStatus } from "../_shared/dashOrderSms.ts";
import { handleOrderDelivered } from "./courierCashLedger.ts";
import {
  aggregateAnalyticsByDay,
  ANALYTICS_CACHE_CONTROL,
  parseOrderItems,
  resolveAnalyticsDateRange,
  type OrderRow,
} from "./analyticsSummary.ts";

const app = new Hono().basePath("/delivery");

// Fleet admin + dash apps send `apikey` (Supabase anon key) alongside Authorization.
// If it is not listed here, browsers block the request with a CORS error after preflight.
applyCors(app, {
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "apikey",
    "x-client-info",
    "accept-profile",
    "prefer",
    "Idempotency-Key",
    "X-Staff-Shift-Token",
    "X-Station-Device-Token",
  ],
});

/** JWT-scoped client only — never falls back to service role (P0 audit fix). */
function getSupabase(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    db: { schema: "delivery" },
  });
}

// Service-role client for admin operations (bypasses RLS for cross-tenant reads)
function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function getPaymentsSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

/** Public schema service client — order_messages lives in public for Realtime. */
function getPublicServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Auth-only client (uses default public schema so supabase.auth.getUser works)
function getAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

/** Apply tier inflation to in-store price → marketplace price (capped). */
async function resolveMarketplaceMenuPrices(
  // deno-lint-ignore no-explicit-any
  sb: { from: (t: string) => any },
  merchantId: string,
  inStorePrice: number,
  marketplaceOverride?: unknown,
): Promise<
  | { ok: true; inStorePrice: number; marketplacePrice: number }
  | { ok: false; error: string }
> {
  const inStore = Math.round(Math.max(0, Number(inStorePrice) || 0) * 100) / 100;
  const { data: merchant } = await sb
    .from("merchants")
    .select("pricing_tier_id, market_id")
    .eq("id", merchantId)
    .maybeSingle();

  let inflation = 0;
  if (merchant?.pricing_tier_id) {
    const { data: tier } = await sb
      .from("merchant_tiers")
      .select("menu_inflation_percent")
      .eq("id", merchant.pricing_tier_id)
      .maybeSingle();
    inflation = Math.max(0, Number(tier?.menu_inflation_percent ?? 0));
  }

  const { resolvePricingLayers } = await import("./pricingLayers.ts");
  const layered = await resolvePricingLayers(sb, {
    marketId: merchant?.market_id != null ? String(merchant.market_id) : null,
  });
  const maxInflation = Math.min(
    1,
    Math.max(0, Number(layered.rules.maxMenuInflationPercent ?? 0.25)),
  );
  inflation = Math.min(inflation, maxInflation);

  let marketplace = Math.round(inStore * (1 + inflation) * 100) / 100;
  if (marketplaceOverride != null && marketplaceOverride !== "") {
    const override = Number(marketplaceOverride);
    if (!Number.isFinite(override) || override < 0) {
      return { ok: false, error: "Invalid marketplace price" };
    }
    const maxAllowed = Math.round(inStore * (1 + maxInflation) * 100) / 100;
    if (override > maxAllowed + 0.01) {
      return {
        ok: false,
        error: `Marketplace price cannot exceed J$${maxAllowed.toFixed(0)} (${(maxInflation * 100).toFixed(0)}% cap)`,
      };
    }
    marketplace = Math.round(override * 100) / 100;
  }

  return { ok: true, inStorePrice: inStore, marketplacePrice: marketplace };
}

// ============================================================================
// Health Check
// ============================================================================
app.get("/health", (c) => c.json({ service: "delivery", status: "ok", timestamp: new Date().toISOString() }));

// ============================================================================
// Merchants
// ============================================================================

// List active merchants (public) — filtered to customer's active delivery town
app.get("/merchants", async (c) => {
  const supabase = getServiceSupabase();
  const { cuisine, lat, lng, radius, vertical, limit: limitRaw, offset: offsetRaw } = c.req.query();
  const limit = Math.min(Math.max(Number.parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(String(offsetRaw ?? "0"), 10) || 0, 0);

  const { resolveActiveMarketIdFromPin } = await import("./discoveryMarketFilter.ts");
  const pin = await resolveActiveMarketIdFromPin(supabase, lat, lng);
  if (pin.missingPin || !pin.covered || pin.marketIds.length === 0) {
    return c.json({
      merchants: [],
      limit,
      offset,
      hasMore: false,
      out_of_coverage: !pin.missingPin,
      missing_pin: pin.missingPin,
    });
  }

  let query = supabase
    .from("merchants")
    .select("*, pricing_tier:merchant_tiers(id, slug, name, commission_rate, base_delivery_fee_jmd, menu_inflation_percent, search_boost, default_delivery_radius_km, promo_eligible)")
    .eq("onboarding_status", "submitted")
    .eq("is_active", true)
    .eq("is_accepting_orders", true);

  if (pin.parishBoundaryMode) {
    query = query.in("market_id", pin.marketIds);
  } else {
    query = query.eq("market_id", pin.marketId);
  }

  if (cuisine) {
    query = query.eq("cuisine_type", cuisine);
  }
  if (vertical) {
    query = query.eq("vertical_type", vertical);
  }
  void radius;

  // Fetch a wider window then sort by search_boost DESC, rating DESC
  const { data, error } = await query
    .order("rating", { ascending: false })
    .range(0, Math.min(offset + limit + 50, 200));

  if (error) return c.json({ error: error.message }, 500);

  const { resolveDeliveryFee } = await import("../_shared/dashPricing.ts");
  const { resolvePricingLayers } = await import("./pricingLayers.ts");
  const layered = await resolvePricingLayers(supabase, {
    marketId: pin.parishBoundaryMode ? pin.marketIds[0] ?? null : pin.marketId,
  });
  const marketRules = layered.rules;

  const enriched = (data ?? []).map((row: Record<string, unknown>) => {
    const tier = row.pricing_tier as Record<string, unknown> | null;
    const tierBase = tier?.base_delivery_fee_jmd != null
      ? Number(tier.base_delivery_fee_jmd)
      : null;
    const boost = tier?.search_boost != null ? Number(tier.search_boost) : 0;
    const deliveryFee = resolveDeliveryFee(marketRules.delivery, null, tierBase);
    return {
      ...row,
      delivery_fee: deliveryFee,
      search_boost: boost,
      is_promoted: boost > 0,
      promoted: boost > 0,
      tier_slug: tier?.slug != null ? String(tier.slug) : null,
    };
  });

  enriched.sort((a, b) => {
    const boostDiff = Number(b.search_boost ?? 0) - Number(a.search_boost ?? 0);
    if (boostDiff !== 0) return boostDiff;
    return Number(b.rating ?? 0) - Number(a.rating ?? 0);
  });

  const page = enriched.slice(offset, offset + limit);

  return c.json({
    merchants: page,
    limit,
    offset,
    hasMore: offset + limit < enriched.length,
    market_id: pin.marketId,
    parish_id: pin.parishId,
    parish_boundary_mode: pin.parishBoundaryMode,
  });
});

  // Get merchant details with menu (UUID or slug)
  app.get("/merchants/:id", async (c) => {
    const supabase = getServiceSupabase();
    const { id } = c.req.param();

    let merchant: Record<string, unknown> | null = null;
    const byId = await supabase
      .from("merchants")
      .select(
        "*, pricing_tier:merchant_tiers(id, slug, name, commission_rate, base_delivery_fee_jmd, menu_inflation_percent, search_boost, default_delivery_radius_km, promo_eligible)",
      )
      .eq("id", id)
      .maybeSingle();
    if (byId.data) {
      merchant = byId.data as Record<string, unknown>;
    } else {
      const bySlug = await supabase
        .from("merchants")
        .select(
          "*, pricing_tier:merchant_tiers(id, slug, name, commission_rate, base_delivery_fee_jmd, menu_inflation_percent, search_boost, default_delivery_radius_km, promo_eligible)",
        )
        .eq("slug", id)
        .maybeSingle();
      if (bySlug.data) merchant = bySlug.data as Record<string, unknown>;
    }

    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    if (merchant.onboarding_status === "draft" || !merchant.is_active) {
      return c.json({ error: "Merchant not found" }, 404);
    }

    const merchantId = String(merchant.id);
    const tier = merchant.pricing_tier as Record<string, unknown> | null;
    const tierBase = tier?.base_delivery_fee_jmd != null
      ? Number(tier.base_delivery_fee_jmd)
      : null;
    const boost = tier?.search_boost != null ? Number(tier.search_boost) : 0;

    const [{ data: categories }, { data: items }, { data: hours }, feeResolved, layered] =
      await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("merchant_id", merchantId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("menu_items")
          .select("*")
          .eq("merchant_id", merchantId)
          .eq("is_available", true)
          .order("sort_order"),
        supabase
          .from("merchant_hours")
          .select("day_of_week, open_time, close_time, is_closed")
          .eq("merchant_id", merchantId)
          .order("day_of_week"),
        resolveFeeRateForMerchant(supabase, merchantId),
        import("./pricingLayers.ts").then(({ resolvePricingLayers }) =>
          resolvePricingLayers(supabase, {
            marketId: merchant!.market_id != null ? String(merchant!.market_id) : null,
          })
        ),
      ]);

    const { resolveDeliveryFee } = await import("../_shared/dashPricing.ts");
    const deliveryFee = resolveDeliveryFee(layered.rules.delivery, null, tierBase);
    const enrichedMerchant = {
      ...merchant,
      delivery_fee: deliveryFee,
      search_boost: boost,
      is_promoted: boost > 0,
      promoted: boost > 0,
      tier_slug: tier?.slug != null ? String(tier.slug) : null,
    };

    const acceptingNow = await assertMerchantAcceptingOrders(supabase, merchantId);

    return c.json({
      merchant: enrichedMerchant,
      categories: categories || [],
      items: items || [],
      hours: hours || [],
      platform_fee_rate: feeResolved.rate,
      is_accepting_orders_now: acceptingNow.ok,
      accepting_orders_error: acceptingNow.ok ? undefined : acceptingNow.error,
    });
  });

  // Resolved platform fee + delivery fee for cart/checkout display (server remains authoritative on order create)
  app.get("/merchants/:id/pricing", async (c) => {
    const supabase = getServiceSupabase();
    const { id } = c.req.param();
    const dropoffLat = c.req.query("dropoff_lat") ? Number(c.req.query("dropoff_lat")) : null;
    const dropoffLng = c.req.query("dropoff_lng") ? Number(c.req.query("dropoff_lng")) : null;
    const subtotalQ = c.req.query("subtotal") ? Number(c.req.query("subtotal")) : 0;
    const paymentRaw = c.req.query("payment_method") ?? "wipay";
    const paymentMethod = paymentRaw === "cash" ? "cash" : "wipay";
    const tipQ = c.req.query("tip") ? Number(c.req.query("tip")) : 0;

    let merchantId: string | null = null;
    let merchantMarketId: string | null = null;
    let deliveryFee = 0;
    const byId = await supabase
      .from("merchants")
      .select("id, delivery_fee, market_id")
      .eq("id", id)
      .maybeSingle();
    if (byId.data) {
      merchantId = String(byId.data.id);
      deliveryFee = Math.max(0, Number(byId.data.delivery_fee ?? 0));
      merchantMarketId = byId.data.market_id != null ? String(byId.data.market_id) : null;
    } else {
      const bySlug = await supabase
        .from("merchants")
        .select("id, delivery_fee, market_id")
        .eq("slug", id)
        .maybeSingle();
      if (bySlug.data) {
        merchantId = String(bySlug.data.id);
        deliveryFee = Math.max(0, Number(bySlug.data.delivery_fee ?? 0));
        merchantMarketId = bySlug.data.market_id != null ? String(bySlug.data.market_id) : null;
      }
    }
    if (!merchantId) return c.json({ error: "Merchant not found" }, 404);

    if (
      dropoffLat == null || dropoffLng == null ||
      !Number.isFinite(dropoffLat) || !Number.isFinite(dropoffLng)
    ) {
      return c.json({
        error: "dropoff_lat and dropoff_lng are required for delivery pricing",
        code: "dropoff_required",
        requireCoverage: true,
      }, 400);
    }

    const { assertSameMarketCoverage, resolveDashOrderPricing } = await import("./pricingResolver.ts");
    {
      const coverageGate = await assertSameMarketCoverage(supabase, {
        dropoffLat,
        dropoffLng,
        merchantMarketId,
        merchantId,
      });
      if (!coverageGate.ok) {
        return c.json({ error: coverageGate.error, code: coverageGate.code }, 400);
      }
    }

    const v2 = await resolveDashOrderPricing(supabase, {
      merchantId,
      subtotal: subtotalQ > 0 ? subtotalQ : 1000,
      dropoffLat,
      dropoffLng,
      paymentMethod,
      tip: tipQ > 0 ? tipQ : undefined,
      requireCoverage: true,
    });

    if (v2 && dropoffLat != null && dropoffLng != null && v2.covered === false) {
      return c.json({
        error: "We don’t deliver to this address yet",
        code: "out_of_coverage",
      }, 400);
    }

    if (!v2) {
      return c.json({ error: "Unable to resolve pricing", code: "pricing_unavailable" }, 503);
    }

    return c.json({
      merchant_id: merchantId,
      pricing_model: "v2",
      platform_fee_rate: null,
      delivery_fee: v2.deliveryFee,
      service_fee: v2.serviceFee,
      processing_fee: v2.processingFee,
      order_total: v2.orderTotal,
      merchant_commission_rate: v2.merchantCommissionRate,
      merchant_commission_amount: v2.merchantCommissionAmount,
      delivery_fee_courier_amount: v2.deliveryFeeCourierAmount,
      delivery_fee_platform_amount: v2.deliveryFeePlatformAmount,
      zone_surcharge_jmd: v2.zoneSurchargeJmd,
      distance_km: v2.distanceKm,
      tax: v2.tax,
      tax_food_jmd: v2.taxFoodJmd,
      tax_platform_jmd: v2.taxPlatformJmd,
      tax_rate_food_percent: v2.taxRateFoodPercent,
      tax_rate_platform_percent: v2.taxRatePlatformPercent,
      tax_rate_percent: v2.taxRatePercent ?? 0,
      gct_registered: v2.gctRegistered ?? false,
      processing_fee_order: v2.processingFeeOrder,
      processing_fee_tip: v2.processingFeeTip,
      courier_tip_net: v2.courierTipNet,
      promo_cost_jmd: v2.promoCostJmd,
      small_order_fee: v2.smallOrderFee ?? 0,
      platform_delivery_subsidy_jmd: v2.platformDeliverySubsidyJmd ?? 0,
      courier_base_pay_jmd: v2.courierBasePayJmd ?? 0,
      courier_distance_pay_jmd: v2.courierDistancePayJmd ?? 0,
      total: v2.customerTotal,
      pricing_profile_version: v2.pricingProfileVersion,
      tier: v2.tierSlug,
      free_delivery_applied: v2.freeDeliveryApplied,
      min_order_subtotal_jmd: v2.rules.minOrderSubtotalJmd ?? 0,
      hard_min_order_subtotal_jmd: v2.rules.hardMinOrderSubtotalJmd ?? 400,
      small_order_threshold_jmd: v2.rules.smallOrderThresholdJmd ?? 0,
      card_processing_fee_percent: v2.rules.cardProcessingFeePercent ?? 0,
      has_override: false,
    });
  });

// Get current user's merchant profile
app.get("/merchant/profile", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  if (await isMerchantOwnerSuspended(user.id)) {
    return c.json({
      error: "Owner account suspended",
      code: OWNER_ACCOUNT_SUSPENDED,
    }, 403);
  }

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) {
    const { data: owned } = await supabase
      .from("merchants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (owned) {
      return c.json({
        merchant: owned,
        membership: { role: "admin", permissions: ["orders", "menu", "analytics", "payouts"], is_owner: true, job_station: null },
      });
    }
    const pendingTeamInvite = await getPendingTeamInviteForProfile(getServiceSupabase, user.email);
    if (pendingTeamInvite) {
      return c.json({ error: "No merchant found", pendingTeamInvite }, 404);
    }
    return c.json({ error: "No merchant found" }, 404);
  }

  const pendingTeamInvite = await getPendingTeamInviteForProfile(getServiceSupabase, user.email);
  return c.json({
    merchant: resolved.merchant,
    membership: resolved.membership,
    ...(pendingTeamInvite ? { pendingTeamInvite } : {}),
  });
});

// Resubmit a rejected application
// Used by the merchant after editing their info on a rejected application.
app.post("/merchant/resubmit", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Use service role to avoid RLS edge cases on the audit log insert
  const sb = getServiceSupabase();
  const { data: merchant, error: fetchErr } = await sb
    .from("merchants")
    .select("*")
    .eq("owner_id", user.id)
    .single();
  if (fetchErr || !merchant) {
    return c.json({ error: "No merchant found" }, 404);
  }
  const m = merchant as Record<string, unknown>;
  if (m.verification_status !== "rejected") {
    return c.json({
      error: "Only rejected applications can be resubmitted",
      currentStatus: m.verification_status,
    }, 400);
  }

  const { data: updated, error: updateErr } = await sb
    .from("merchants")
    .update({
      verification_status: "pending",
      rejection_reason: null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", m.id as string)
    .select()
    .single();
  if (updateErr) return c.json({ error: updateErr.message }, 500);

  await sb.from("merchant_audit_log").insert({
    merchant_id: m.id as string,
    actor_id: user.id,
    actor_email: user.email || "",
    action: "merchant_resubmitted",
    from_status: "rejected",
    to_status: "pending",
    notes: "Merchant resubmitted application after edits",
  });

  return c.json({ merchant: updated });
});

// Resolve merchant for authenticated user (owner or team member)
async function getMerchantForUser(
  _supabase: ReturnType<typeof getSupabase>,
  userId: string,
  userEmail?: string | null,
) {
  const resolved = await resolveMerchantAccess(userId, userEmail);
  if (!resolved) return null;
  return resolved.merchant;
}

async function requireMerchantForId(
  authHeader: string,
  merchantId: string,
  permission?: TeamPermission,
): Promise<
  | { ok: true; merchant: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved || String(resolved.merchant.id) !== merchantId) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  if (permission && !requireMerchantPermission(resolved.membership, permission)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, merchant: resolved.merchant };
}

async function requireOwnedMerchant(
  authHeader: string,
  merchantId: string,
): Promise<
  | { ok: true; merchant: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  return requireMerchantForId(authHeader, merchantId);
}

// ============================================================================
// Operating Hours
// ============================================================================

// Get merchant operating hours
app.get("/merchants/:id/hours", async (c) => {
  const supabase = getServiceSupabase();
  const { id } = c.req.param();

  let merchantId = id;
  const byId = await supabase.from("merchants").select("id").eq("id", id).maybeSingle();
  if (byId.data) {
    merchantId = String((byId.data as { id: string }).id);
  } else {
    const bySlug = await supabase.from("merchants").select("id").eq("slug", id).maybeSingle();
    if (!bySlug.data) return c.json({ error: "Merchant not found" }, 404);
    merchantId = String((bySlug.data as { id: string }).id);
  }

  const { data: hours, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("day_of_week");
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ hours: hours || [] });
});

// Set/update merchant operating hours (bulk upsert)
app.post("/merchants/:id/hours", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const { id } = c.req.param();
  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant || merchant.id !== id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { hours } = body;
  
  if (!Array.isArray(hours)) {
    return c.json({ error: "Hours must be an array" }, 400);
  }
  
  const serviceSb = getServiceSupabase();
  await serviceSb
    .from("merchant_hours")
    .delete()
    .eq("merchant_id", id);
  
  const hoursData = hours.map((h: any) => ({
    merchant_id: id,
    day_of_week: h.dayOfWeek,
    open_time: h.openTime,
    close_time: h.closeTime,
    is_closed: h.isClosed || false,
  }));
  
  const { data, error } = await serviceSb
    .from("merchant_hours")
    .insert(hoursData)
    .select();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ hours: data }, 201);
});

// Holiday / exception hours
app.get("/merchants/:id/special-hours", async (c) => {
  const supabase = getServiceSupabase();
  const { id } = c.req.param();
  const { data, error } = await supabase
    .from("merchant_special_hours")
    .select("*")
    .eq("merchant_id", id)
    .order("special_date");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    specialHours: (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      date: row.special_date,
      isClosed: row.is_closed,
      openTime: row.open_time,
      closeTime: row.close_time,
      label: row.label,
    })),
  });
});

app.put("/merchants/:id/special-hours", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { id } = c.req.param();
  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant || merchant.id !== id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const specialHours = Array.isArray(body.specialHours) ? body.specialHours : [];
  const serviceSb = getServiceSupabase();

  await serviceSb.from("merchant_special_hours").delete().eq("merchant_id", id);

  if (specialHours.length === 0) {
    return c.json({ specialHours: [] });
  }

  const rows = specialHours.map((entry: Record<string, unknown>) => ({
    merchant_id: id,
    special_date: String(entry.date || entry.special_date || "").slice(0, 10),
    is_closed: entry.isClosed !== false && entry.is_closed !== false,
    open_time: entry.openTime || entry.open_time || null,
    close_time: entry.closeTime || entry.close_time || null,
    label: entry.label ? String(entry.label) : null,
    updated_at: new Date().toISOString(),
  })).filter((r: { special_date: string }) => /^\d{4}-\d{2}-\d{2}$/.test(r.special_date));

  if (rows.length === 0) {
    return c.json({ specialHours: [] });
  }

  const { data, error } = await serviceSb
    .from("merchant_special_hours")
    .insert(rows)
    .select();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    specialHours: (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      date: row.special_date,
      isClosed: row.is_closed,
      openTime: row.open_time,
      closeTime: row.close_time,
      label: row.label,
    })),
  });
});

// ============================================================================
// Menu Management
// ============================================================================

// Add menu category
app.post("/merchants/:merchantId/categories", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const body = await c.req.json();
  const serviceSb = getServiceSupabase();

  const { data, error } = await serviceSb
    .from("menu_categories")
    .insert({
      merchant_id: merchantId,
      name: body.name,
      description: body.description,
      sort_order: body.sortOrder || 0,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ category: data }, 201);
});

// Update menu category
app.put("/merchants/:merchantId/categories/:categoryId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId, categoryId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const body = await c.req.json();
  const serviceSb = getServiceSupabase();

  const { data, error } = await serviceSb
    .from("menu_categories")
    .update({
      name: body.name,
      description: body.description,
      sort_order: body.sortOrder,
    })
    .eq("id", categoryId)
    .eq("merchant_id", merchantId)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ category: data });
});

// Delete menu category
app.delete("/merchants/:merchantId/categories/:categoryId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId, categoryId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const serviceSb = getServiceSupabase();

  // Move items in this category to uncategorized (null)
  await serviceSb
    .from("menu_items")
    .update({ category_id: null })
    .eq("category_id", categoryId)
    .eq("merchant_id", merchantId);

  const { error } = await serviceSb
    .from("menu_categories")
    .delete()
    .eq("id", categoryId)
    .eq("merchant_id", merchantId);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// Add menu item
app.post("/merchants/:merchantId/items", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const serviceSb = getServiceSupabase();
  const body = await c.req.json();
  const inStore = Number(body.in_store_price ?? body.inStorePrice ?? body.price ?? 0);
  if (!Number.isFinite(inStore) || inStore < 0) {
    return c.json({ error: "Invalid in-store price" }, 400);
  }
  const priced = await resolveMarketplaceMenuPrices(serviceSb, merchantId, inStore, body.marketplace_price ?? body.marketplacePrice);
  if (!priced.ok) return c.json({ error: priced.error }, 400);

  const { data, error } = await serviceSb
    .from("menu_items")
    .insert({
      merchant_id: merchantId,
      category_id: body.categoryId,
      name: body.name,
      description: body.description,
      price: priced.marketplacePrice,
      in_store_price: priced.inStorePrice,
      marketplace_price: priced.marketplacePrice,
      image_url: body.imageUrl,
      is_available: body.isAvailable !== false,
      is_featured: body.isFeatured || false,
      prep_time_mins: body.prepTimeMins,
      calories: body.calories,
      options: body.options || [],
    })
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ item: data }, 201);
});

// Update menu item
app.put("/merchants/:merchantId/items/:itemId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId, itemId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const serviceSb = getServiceSupabase();
  const body = await c.req.json();
  const updates: Record<string, unknown> = { ...body };
  // Normalize camelCase from clients
  if (body.categoryId != null) updates.category_id = body.categoryId;
  if (body.imageUrl != null) updates.image_url = body.imageUrl;
  if (body.isAvailable != null) updates.is_available = body.isAvailable;
  if (body.isFeatured != null) updates.is_featured = body.isFeatured;
  if (body.prepTimeMins != null) updates.prep_time_mins = body.prepTimeMins;

  const hasPriceUpdate =
    body.price != null ||
    body.in_store_price != null ||
    body.inStorePrice != null ||
    body.marketplace_price != null ||
    body.marketplacePrice != null;

  if (hasPriceUpdate) {
    const inStore = Number(
      body.in_store_price ?? body.inStorePrice ?? body.price ?? 0,
    );
    if (!Number.isFinite(inStore) || inStore < 0) {
      return c.json({ error: "Invalid in-store price" }, 400);
    }
    const priced = await resolveMarketplaceMenuPrices(
      serviceSb,
      merchantId,
      inStore,
      body.marketplace_price ?? body.marketplacePrice,
    );
    if (!priced.ok) return c.json({ error: priced.error }, 400);
    updates.in_store_price = priced.inStorePrice;
    updates.marketplace_price = priced.marketplacePrice;
    updates.price = priced.marketplacePrice;
  }

  delete updates.categoryId;
  delete updates.imageUrl;
  delete updates.isAvailable;
  delete updates.isFeatured;
  delete updates.prepTimeMins;
  delete updates.inStorePrice;
  delete updates.marketplacePrice;

  const { data, error } = await serviceSb
    .from("menu_items")
    .update(updates)
    .eq("id", itemId)
    .eq("merchant_id", merchantId)
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ item: data });
});

// Delete menu item
app.delete("/merchants/:merchantId/items/:itemId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const { merchantId, itemId } = c.req.param();
  const access = await requireMerchantForId(authHeader, merchantId, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const serviceSb = getServiceSupabase();
  const { error } = await serviceSb
    .from("menu_items")
    .delete()
    .eq("id", itemId)
    .eq("merchant_id", merchantId);
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// Authenticated merchant menu (includes unavailable items)
app.get("/merchant/menu", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchantId = access.resolved.merchant.id as string;
  const serviceSb = getServiceSupabase();

  const { data: categories, error: catError } = await serviceSb
    .from("menu_categories")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("sort_order");

  if (catError) return c.json({ error: catError.message }, 500);

  const { data: items, error: itemError } = await serviceSb
    .from("menu_items")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("sort_order");

  if (itemError) return c.json({ error: itemError.message }, 500);

  return c.json({
    merchant: access.resolved.merchant,
    categories: categories || [],
    items: items || [],
  });
});

// Bulk reorder categories and/or items
app.put("/merchant/menu/reorder", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "menu");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchantId = access.resolved.merchant.id as string;
  const body = await c.req.json();
  const categories = Array.isArray(body.categories) ? body.categories : [];
  const items = Array.isArray(body.items) ? body.items : [];
  const serviceSb = getServiceSupabase();

  let categoriesUpdated = 0;
  let itemsUpdated = 0;

  for (const entry of categories) {
    if (!entry?.id || entry.sortOrder == null) continue;
    const { error } = await serviceSb
      .from("menu_categories")
      .update({ sort_order: entry.sortOrder })
      .eq("id", entry.id)
      .eq("merchant_id", merchantId);
    if (error) return c.json({ error: error.message }, 500);
    categoriesUpdated += 1;
  }

  for (const entry of items) {
    if (!entry?.id || entry.sortOrder == null) continue;
    const update: Record<string, unknown> = { sort_order: entry.sortOrder };
    if (entry.categoryId !== undefined) {
      update.category_id = entry.categoryId;
    }
    const { error } = await serviceSb
      .from("menu_items")
      .update(update)
      .eq("id", entry.id)
      .eq("merchant_id", merchantId);
    if (error) return c.json({ error: error.message }, 500);
    itemsUpdated += 1;
  }

  return c.json({ ok: true, categoriesUpdated, itemsUpdated });
});

// ============================================================================
// Orders (customer place/detail/history → customerOrderRoutes.ts)
// ============================================================================

// Update order status
/** When any actor cancels an assigned order, free the courier's availability slot. */
async function clearCourierActiveOrderOnCancel(
  serviceSb: ReturnType<typeof getServiceSupabase>,
  status: string,
  courierId: string | null | undefined,
  orderId?: string,
) {
  if (status !== "cancelled") return;
  // Clear by driver_id when known
  if (courierId) {
    await serviceSb
      .from("courier_availability")
      .update({ active_order_id: null })
      .eq("driver_id", courierId);
  }
  // Also clear by active_order_id so a mismatched courier_id cannot leave a dangling slot
  if (orderId) {
    await serviceSb
      .from("courier_availability")
      .update({ active_order_id: null })
      .eq("active_order_id", orderId);
  }
}

app.put("/orders/:id/status", async (c) => {
  const deviceToken = c.req.header("X-Station-Device-Token");
  const authHeader = c.req.header("Authorization");
  const { id } = c.req.param();
  const body = await c.req.json();
  const { status, notes, actorType, estimatedPrepTimeMins } = body;

  function transitionsForChannel(channel: string | null | undefined): Record<string, string[]> {
    if (channel === "in_store" || channel === "phone") return inStoreStatusTransitions();
    return roamStatusTransitions();
  }

  if (deviceToken && actorType === "merchant") {
    const serviceSb = getServiceSupabase();
    const device = await resolveEnrolledDevice(deviceToken, serviceSb);
    if (!device) return c.json({ error: "Invalid device session" }, 401);

    const { data: order, error: orderError } = await serviceSb
      .from("orders")
      .select("status, merchant_id, channel, courier_id")
      .eq("id", id)
      .single();

    if (orderError) return c.json({ error: orderError.message }, 404);
    const orderRow = order as Record<string, unknown>;
    if (String(orderRow.merchant_id) !== device.merchantId) {
      return c.json({ error: "Order not found" }, 404);
    }

    const allowed = transitionsForChannel(String(orderRow.channel ?? "roam_app"))[String(orderRow.status)] || [];
    if (!allowed.includes(status)) {
      return c.json({ error: `Invalid status transition from ${orderRow.status} to ${status}` }, 400);
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "accepted") updateData.accepted_at = new Date().toISOString();
    if (status === "preparing") updateData.preparing_at = new Date().toISOString();
    if (status === "ready") updateData.ready_at = new Date().toISOString();
    if (status === "picked_up") updateData.picked_up_at = new Date().toISOString();
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();
    if (status === "cancelled") {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancelled_by = actorType;
      updateData.cancellation_reason = notes;
    }
    if (estimatedPrepTimeMins != null) {
      updateData.estimated_prep_time_mins = estimatedPrepTimeMins;
    }

    const { data: updatedOrder, error: updateError } = await serviceSb
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) return c.json({ error: updateError.message }, 500);

    await clearCourierActiveOrderOnCancel(
      serviceSb,
      status,
      orderRow.courier_id as string | null | undefined,
      id,
    );
    if (status === "cancelled") {
      await applyCancelCompensation(serviceSb, id, String(actorType));
    }

    const shiftHeader = c.req.header("X-Staff-Shift-Token");
    let teamMemberId: string | null = null;
    if (shiftHeader) {
      const shift = await resolveShiftTokenFromRequest(
        shiftHeader,
        device.merchantId,
        serviceSb,
      );
      if (shift) teamMemberId = shift.teamMemberId;
    }

    await serviceSb.from("order_events").insert({
      order_id: id,
      status,
      actor_type: "merchant_device",
      actor_id: device.deviceId,
      team_member_id: teamMemberId,
      notes,
    });

    // Best-effort customer SMS on status change
    await notifyCustomerOrderStatus(serviceSb, id, status);

    return c.json({ order: updatedOrder });
  }

  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const serviceSb = getServiceSupabase();
  let merchantAccess: Awaited<ReturnType<typeof requireResolvedMerchantWithPermission>> | null = null;

  if (actorType === "merchant") {
    merchantAccess = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!merchantAccess.ok) return c.json({ error: merchantAccess.message }, merchantAccess.status);
  }

  if (actorType === "courier") {
    const { data: orderRow, error: orderLookupError } = await serviceSb
      .from("orders")
      .select("status, channel, courier_id")
      .eq("id", id)
      .single();
    if (orderLookupError) return c.json({ error: orderLookupError.message }, 404);
    if (String(orderRow.courier_id) !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const courierAllowed = COURIER_TRANSITIONS[String(orderRow.status)] || [];
    if (!courierAllowed.includes(status)) {
      return c.json({ error: `Invalid status transition from ${orderRow.status} to ${status}` }, 400);
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "picked_up") updateData.picked_up_at = new Date().toISOString();
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();
    if (status === "cancelled") {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancelled_by = "courier";
      updateData.cancellation_reason = notes;
      updateData.courier_compensation_amount = 0;
    }

    const { data: updatedOrder, error: updateError } = await serviceSb
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .eq("courier_id", user.id)
      .select()
      .single();

    if (updateError) return c.json({ error: updateError.message }, 500);

    await serviceSb.from("order_events").insert({
      order_id: id,
      status,
      actor_type: "courier",
      actor_id: user.id,
      notes,
    });

    if (status === "delivered" || status === "cancelled") {
      await serviceSb
        .from("courier_availability")
        .update({ active_order_id: null })
        .eq("driver_id", user.id);
      if (status === "delivered") {
        await completeStackLeg(serviceSb, user.id, id);
        await handleOrderDelivered(serviceSb, id, user.id);
      }
    }

    await notifyCustomerOrderStatus(serviceSb, id, status);
    return c.json({ order: updatedOrder });
  }
  
  // Merchant writes use service role — orders UPDATE RLS WITH CHECK subqueries
  // delivery.orders and recurses under the JWT-scoped client.
  const writer = actorType === "merchant" ? serviceSb : supabase;

  // Get current order
  const { data: order, error: orderError } = await writer
    .from("orders")
    .select("status, channel, courier_id, merchant_id")
    .eq("id", id)
    .single();
  
  if (orderError) return c.json({ error: orderError.message }, 404);

  if (actorType === "merchant" && merchantAccess?.ok) {
    if (String((order as { merchant_id?: string }).merchant_id) !== String(merchantAccess.resolved.merchant.id)) {
      return c.json({ error: "Order not found" }, 404);
    }
  }
  
  const allowed = transitionsForChannel((order as { channel?: string }).channel)[order.status] || [];
  if (!allowed.includes(status)) {
    return c.json({ error: `Invalid status transition from ${order.status} to ${status}` }, 400);
  }
  
  // Update order
  const updateData: Record<string, any> = { status };
  if (status === "accepted") updateData.accepted_at = new Date().toISOString();
  if (status === "preparing") updateData.preparing_at = new Date().toISOString();
  if (status === "ready") updateData.ready_at = new Date().toISOString();
  if (status === "assigned") updateData.assigned_at = new Date().toISOString();
  if (status === "picked_up") updateData.picked_up_at = new Date().toISOString();
  if (status === "delivered") updateData.delivered_at = new Date().toISOString();
  if (status === "cancelled") {
    updateData.cancelled_at = new Date().toISOString();
    updateData.cancelled_by = actorType;
    updateData.cancellation_reason = notes;
  }
  if (estimatedPrepTimeMins != null) {
    updateData.estimated_prep_time_mins = estimatedPrepTimeMins;
  }
  
  const { data: updatedOrder, error: updateError } = await writer
    .from("orders")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  
  if (updateError) return c.json({ error: updateError.message }, 500);

  await clearCourierActiveOrderOnCancel(
    serviceSb,
    status,
    (order as { courier_id?: string | null }).courier_id,
    id,
  );
  if (status === "cancelled") {
    await applyCancelCompensation(serviceSb, id, String(actorType));
    const courierId = (order as { courier_id?: string | null }).courier_id;
    if (courierId) await completeStackLeg(serviceSb, String(courierId), id);
  }
  if (status === "delivered") {
    const courierId = (order as { courier_id?: string | null }).courier_id;
    if (courierId) await completeStackLeg(serviceSb, String(courierId), id);
    await handleOrderDelivered(
      serviceSb,
      id,
      courierId ? String(courierId) : null,
    );
  }

  // Soft-launch: when merchant marks ready, fan out courier offers
  if (status === "ready" && actorType === "merchant") {
    await dispatchOffersForOrder(serviceSb, id);
  }

  const shiftHeader = c.req.header("X-Staff-Shift-Token");
  let teamMemberId: string | null = null;
  if (shiftHeader && actorType === "merchant" && merchantAccess?.ok) {
    const shift = await resolveShiftTokenFromRequest(
      shiftHeader,
      merchantAccess.resolved.merchant.id as string,
      serviceSb,
    );
    if (shift) teamMemberId = shift.teamMemberId;
  }

  // Log event
  await writer.from("order_events").insert({
    order_id: id,
    status,
    actor_type: actorType,
    actor_id: user.id,
    team_member_id: teamMemberId,
    notes,
  });

  await notifyCustomerOrderStatus(getServiceSupabase(), id, status);

  return c.json({ order: updatedOrder });
});

import { ORDER_CUSTOMER_EMBED, ORDER_CUSTOMER_EMBED_MINIMAL, isCustomerEmbedError } from "./orderSelectEmbeds.ts";

async function attachCustomersToOrders(
  sb: ReturnType<typeof getServiceSupabase>,
  orders: Record<string, unknown>[],
) {
  const customerIds = [
    ...new Set(
      orders
        .map((order) => order.customer_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (!customerIds.length) return orders;

  const { data: customers, error } = await sb
    .from("customers")
    .select("id, name, phone")
    .in("id", customerIds);
  if (error) {
    console.error("[merchant/orders] customer lookup failed:", error.message);
    return orders;
  }

  const customerById = new Map(
    (customers || []).map((row) => [String((row as Record<string, unknown>).id), row]),
  );
  return orders.map((order) => {
    const customerId = order.customer_id ? String(order.customer_id) : null;
    if (!customerId) return order;
    const customer = customerById.get(customerId);
    return customer ? { ...order, customer } : order;
  });
}

async function enrichOrdersWithLastHandledBy(
  sb: ReturnType<typeof getServiceSupabase>,
  merchantId: string,
  orders: Record<string, unknown>[],
) {
  if (!orders.length) return orders;

  const orderIds = orders.map((order) => String(order.id));
  const { data: events } = await sb
    .from("order_events")
    .select("order_id, status, actor_id, team_member_id, created_at, actor_type")
    .in("order_id", orderIds)
    .eq("actor_type", "merchant")
    .order("created_at", { ascending: false });

  const { data: members } = await sb
    .from("merchant_team_members")
    .select("id, user_id, name")
    .eq("merchant_id", merchantId);

  const memberNameByUserId = new Map<string, string>();
  const memberNameById = new Map<string, string>();
  for (const member of members || []) {
    const row = member as Record<string, unknown>;
    memberNameById.set(String(row.id), String(row.name));
    if (row.user_id) {
      memberNameByUserId.set(String(row.user_id), String(row.name));
    }
  }

  const latestByOrder = new Map<string, Record<string, unknown>>();
  for (const event of events || []) {
    const row = event as Record<string, unknown>;
    const orderId = String(row.order_id);
    if (!latestByOrder.has(orderId)) {
      latestByOrder.set(orderId, row);
    }
  }

  return orders.map((order) => {
    const latest = latestByOrder.get(String(order.id));
    if (!latest) return order;
    const teamMemberId = latest.team_member_id ? String(latest.team_member_id) : null;
    const name = teamMemberId
      ? memberNameById.get(teamMemberId)
      : latest.actor_id
        ? memberNameByUserId.get(String(latest.actor_id))
        : undefined;
    if (!name) return order;
    return {
      ...order,
      lastHandledBy: {
        name,
        at: String(latest.created_at),
        action: String(latest.status),
      },
    };
  });
}

app.get("/merchant/orders", async (c) => {
  const deviceToken = c.req.header("X-Station-Device-Token");
  const authHeader = c.req.header("Authorization");
  const { status, from, to, limit, channel } = c.req.query();

  let merchantId: string;
  let queryClient: ReturnType<typeof getSupabase>;

  if (deviceToken) {
    const serviceSb = getServiceSupabase();
    const device = await resolveEnrolledDevice(deviceToken, serviceSb);
    if (!device) return c.json({ error: "Invalid device session" }, 401);
    merchantId = device.merchantId;
    queryClient = serviceSb;
  } else {
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);

    merchantId = access.resolved.merchant.id as string;
    queryClient = getServiceSupabase();
  }

  let query = queryClient
    .from("orders")
    .select(`*, ${ORDER_CUSTOMER_EMBED}`)
    .eq("merchant_id", merchantId);

  const channelFilter = channel ?? null;
  if (channelFilter === "in_store") {
    query = query.eq("channel", "in_store");
  } else if (channelFilter === "roam_app") {
    query = query.eq("channel", "roam_app");
  }
  // channel=all or omitted: no channel filter (backward compatible pre-migration)
  
  // Hide unpaid WiPay/PayPal orders from the kitchen until payment clears.
  query = query.or("payment_method.neq.wipay,payment_status.neq.pending");

  if (status) {
    query = query.eq("status", status);
  } else {
    const activeStatuses =
      channelFilter === "in_store"
        ? ["paid", "preparing", "ready"]
        : channelFilter === "all"
          ? ["placed", "accepted", "preparing", "ready", "paid"]
          : ["placed", "accepted", "preparing", "ready"];
    query = query.in("status", activeStatuses);
  }

  if (from) {
    query = query.gte("placed_at", from);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    query = query.lte("placed_at", toDate.toISOString());
  }
  if (limit) {
    const parsedLimit = parseInt(limit, 10);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      query = query.limit(parsedLimit);
    }
  }
  
  let { data: orders, error } = await query.order("created_at", { ascending: true });

  if (error && isCustomerEmbedError(error)) {
    console.warn("[merchant/orders] customer embed failed, falling back:", error.message);
    let fallbackQuery = queryClient
      .from("orders")
      .select("*")
      .eq("merchant_id", merchantId);

    if (channelFilter === "in_store") {
      fallbackQuery = fallbackQuery.eq("channel", "in_store");
    } else if (channelFilter === "roam_app") {
      fallbackQuery = fallbackQuery.eq("channel", "roam_app");
    }
    fallbackQuery = fallbackQuery.or("payment_method.neq.wipay,payment_status.neq.pending");
    if (status) {
      fallbackQuery = fallbackQuery.eq("status", status);
    } else {
      const activeStatuses =
        channelFilter === "in_store"
          ? ["paid", "preparing", "ready"]
          : channelFilter === "all"
            ? ["placed", "accepted", "preparing", "ready", "paid"]
            : ["placed", "accepted", "preparing", "ready"];
      fallbackQuery = fallbackQuery.in("status", activeStatuses);
    }
    if (from) fallbackQuery = fallbackQuery.gte("placed_at", from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      fallbackQuery = fallbackQuery.lte("placed_at", toDate.toISOString());
    }
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
        fallbackQuery = fallbackQuery.limit(parsedLimit);
      }
    }

    const fallback = await fallbackQuery.order("created_at", { ascending: true });
    orders = fallback.data;
    error = fallback.error;
    if (!error && orders?.length) {
      orders = await attachCustomersToOrders(queryClient, orders as Record<string, unknown>[]);
    }
  }

  if (error) return c.json({ error: error.message }, 500);
  const enriched = await enrichOrdersWithLastHandledBy(
    getServiceSupabase(),
    merchantId,
    (orders || []) as Record<string, unknown>[],
  );
  return c.json({ orders: enriched });
});

// Available orders for couriers
app.get("/courier/available-orders", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const serviceSb = getServiceSupabase();
  const gate = await requireActiveCourier(serviceSb, user.id);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);
  
  const { data: orders, error } = await serviceSb
    .from("orders")
    .select(`
      *,
      merchant:merchants(id, name, address, lat, lng, phone, vertical_type, fulfillment_type),
      ${ORDER_CUSTOMER_EMBED_MINIMAL}
    `)
    .eq("status", "ready")
    .is("courier_id", null)
    .order("ready_at", { ascending: true });
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ orders: orders || [] });
});

// Courier accepts order (pull claim → assigned, not picked_up)
app.post("/orders/:id/accept-delivery", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const { id } = c.req.param();
  const serviceSb = getServiceSupabase();

  const gate = await requireActiveCourier(serviceSb, user.id);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);
  
  // Atomic claim via service role + status predicates (race-safe)
  const { data: order, error } = await serviceSb
    .from("orders")
    .update({
      courier_id: user.id,
      status: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "ready")
    .is("courier_id", null)
    .select()
    .maybeSingle();
  
  if (error || !order) return c.json({ error: "Order not available" }, 400);
  
  await serviceSb.from("order_events").insert({
    order_id: id,
    status: "assigned",
    actor_type: "courier",
    actor_id: user.id,
  });

  await serviceSb
    .from("courier_offers")
    .update({ status: "superseded" })
    .eq("order_id", id)
    .eq("status", "pending");

  await serviceSb
    .from("courier_availability")
    .update({ active_order_id: id, is_online: true })
    .eq("driver_id", user.id);
  
  return c.json({ order });
});

// Courier live GPS — assigned courier only
app.patch("/orders/:id/courier-location", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const lat = Number(body.lat ?? body.courierLat);
  const lng = Number(body.lng ?? body.courierLng);
  const clientSeqRaw = body.client_seq ?? body.clientSeq;
  const clientSeq =
    clientSeqRaw != null && Number.isFinite(Number(clientSeqRaw))
      ? Math.trunc(Number(clientSeqRaw))
      : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat and lng required" }, 400);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: "Invalid coordinates" }, 400);
  }

  const serviceSb = getServiceSupabase();
  const { data: order, error: orderError } = await serviceSb
    .from("orders")
    .select("id, courier_id, status")
    .eq("id", id)
    .single();

  if (orderError || !order) return c.json({ error: "Order not found" }, 404);
  if (String(order.courier_id) !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const liveStatuses = ["picked_up", "in_transit", "ready"];
  if (!liveStatuses.includes(String(order.status))) {
    return c.json({ error: "Order is not in a live delivery state" }, 400);
  }

  const { data: updated, error: updateError } = await serviceSb
    .from("orders")
    .update({
      courier_lat: lat,
      courier_lng: lng,
      courier_location_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, courier_lat, courier_lng, courier_location_updated_at")
    .single();

  if (updateError) return c.json({ error: updateError.message }, 500);

  // Mirror onto courier_availability via presence RPC (lat/lng + H3 together)
  const { upsertCourierPresence } = await import("./courierPresence.ts");
  const presence = await upsertCourierPresence(serviceSb, {
    driverId: user.id,
    lat,
    lng,
    isOnline: true,
    activeOrderId: id,
  });
  if (!presence.ok) {
    return c.json(
      { error: presence.error, message: presence.message },
      presence.status,
    );
  }

  return c.json({ location: updated, client_seq: clientSeq });
});

// ============================================================================
// Merchant analytics
// ============================================================================

function bucketKey(date: Date, granularity: string) {
  if (granularity === "day") {
    return date.toISOString().slice(0, 10);
  }
  return `${date.toISOString().slice(0, 13)}:00`;
}

function formatBucketLabel(key: string, granularity: string) {
  if (granularity === "day") {
    const d = new Date(key);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  const hour = parseInt(key.slice(11, 13), 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  return `${h12}${suffix}`;
}

const CATEGORY_COLORS = [
  "#10b981",
  "#006c49",
  "#4edea3",
  "#8b4ef7",
  "#712edd",
  "#f59e0b",
  "#3b82f6",
];

const DAY_OF_WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function buildItemCategoryMap(
  supabase: ReturnType<typeof getServiceSupabase>,
  merchantId: string,
): Promise<Record<string, string>> {
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name")
    .eq("merchant_id", merchantId);

  const { data: items } = await supabase
    .from("menu_items")
    .select("name, category_id")
    .eq("merchant_id", merchantId);

  const categoryNameById: Record<string, string> = {};
  for (const cat of categories || []) {
    categoryNameById[String(cat.id)] = String(cat.name);
  }

  const map: Record<string, string> = {};
  for (const item of items || []) {
    const key = String(item.name).toLowerCase().trim();
    const categoryId = item.category_id ? String(item.category_id) : "";
    map[key] = categoryId ? (categoryNameById[categoryId] || "Uncategorized") : "Uncategorized";
  }
  return map;
}

function buildCategoryBreakdown(
  delivered: OrderRow[],
  itemCategoryMap: Record<string, string>,
  totalRevenue: number,
) {
  const revenueByCategory: Record<string, number> = {};

  for (const order of delivered) {
    const items = parseOrderItems(order.items);
    let itemRevenue = 0;

    for (const item of items) {
      const lineRevenue = (item.price || 0) * item.quantity;
      itemRevenue += lineRevenue;
      const category =
        itemCategoryMap[item.name.toLowerCase().trim()] || "Uncategorized";
      revenueByCategory[category] = (revenueByCategory[category] || 0) + lineRevenue;
    }

    if (itemRevenue === 0 && items.length > 0) {
      const subtotal = Number(order.subtotal || 0);
      const perItem = subtotal / items.length;
      for (const item of items) {
        const category =
          itemCategoryMap[item.name.toLowerCase().trim()] || "Uncategorized";
        revenueByCategory[category] = (revenueByCategory[category] || 0) + perItem;
      }
    } else if (items.length === 0) {
      revenueByCategory["Uncategorized"] =
        (revenueByCategory["Uncategorized"] || 0) + Number(order.subtotal || 0);
    }
  }

  const entries = Object.entries(revenueByCategory).sort((a, b) => b[1] - a[1]);
  const revenueTotal = entries.reduce((sum, [, value]) => sum + value, 0) || totalRevenue;

  return entries.map(([name, revenue], index) => ({
    name,
    percent: revenueTotal > 0 ? Math.round((revenue / revenueTotal) * 100) : 0,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    revenue,
  }));
}

function buildRevenueByDayOfWeek(delivered: OrderRow[]) {
  const buckets = Array.from({ length: 7 }, (_, day) => ({
    day,
    label: DAY_OF_WEEK_LABELS[day],
    revenue: 0,
    orders: 0,
  }));

  for (const order of delivered) {
    const placed = new Date(String(order.placed_at || order.created_at));
    const day = placed.getDay();
    buckets[day].revenue += Number(order.subtotal || 0);
    buckets[day].orders += 1;
  }

  return buckets;
}

function buildRevenueByHour(delivered: OrderRow[]) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`,
    revenue: 0,
    orders: 0,
  }));

  for (const order of delivered) {
    const placed = new Date(String(order.placed_at || order.created_at));
    const hour = placed.getHours();
    buckets[hour].revenue += Number(order.subtotal || 0);
    buckets[hour].orders += 1;
  }

  return buckets;
}

app.get("/merchant/analytics", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "analytics");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchantId = access.resolved.merchant.id as string;
  const { from, to, granularity: rawGranularity } = c.req.query();
  const granularity = rawGranularity === "day" ? "day" : "hour";

  // Default last 30 days when from/to omitted — avoid unbounded order scans
  const { fromDate, toDate } = resolveAnalyticsDateRange(from, to);

  const serviceSb = getServiceSupabase();
  const { data: orders, error } = await serviceSb
    .from("orders")
    .select("*")
    .eq("merchant_id", merchantId)
    .gte("placed_at", fromDate.toISOString())
    .lte("placed_at", toDate.toISOString());

  if (error) return c.json({ error: error.message }, 500);

  const allOrders = (orders || []) as OrderRow[];
  const summary = aggregateAnalyticsByDay(allOrders);
  const { delivered, cancelled, active, totalRevenue, totalOrders, daily } = summary;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const prepTimes: number[] = [];
  for (const o of delivered) {
    const accepted = o.accepted_at ? new Date(String(o.accepted_at)).getTime() : null;
    const ready = o.ready_at ? new Date(String(o.ready_at)).getTime() : null;
    if (accepted && ready && ready > accepted) {
      prepTimes.push((ready - accepted) / 60000);
    }
  }
  const avgPrepTime = prepTimes.length > 0
    ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
    : 0;

  const revenueBuckets: Record<string, number> = {};
  const volumeBuckets: Record<string, number> = {};
  if (granularity === "day") {
    for (const bucket of daily) {
      revenueBuckets[bucket.key] = bucket.revenue;
      volumeBuckets[bucket.key] = bucket.orders;
    }
  } else {
    for (const o of delivered) {
      const placed = new Date(String(o.placed_at || o.created_at));
      const key = bucketKey(placed, granularity);
      revenueBuckets[key] = (revenueBuckets[key] || 0) + Number(o.subtotal || 0);
      volumeBuckets[key] = (volumeBuckets[key] || 0) + 1;
    }
  }

  const bucketKeys = Object.keys(revenueBuckets).sort();
  const revenueByBucket = bucketKeys.map((key) => ({
    key,
    label: formatBucketLabel(key, granularity),
    revenue: revenueBuckets[key] || 0,
  }));
  const orderVolumeByBucket = bucketKeys.map((key) => ({
    key,
    label: formatBucketLabel(key, granularity),
    count: volumeBuckets[key] || 0,
  }));

  const itemMap: Record<string, { name: string; orders: number; revenue: number }> = {};
  for (const o of delivered) {
    for (const item of parseOrderItems(o.items)) {
      if (!itemMap[item.name]) {
        itemMap[item.name] = { name: item.name, orders: 0, revenue: 0 };
      }
      itemMap[item.name].orders += item.quantity;
      itemMap[item.name].revenue += (item.price || 0) * item.quantity;
    }
  }
  const topItems = Object.values(itemMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name,
      revenue: item.revenue,
      orders: item.orders,
      progress: totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0,
    }));

  const accepted = active.filter((o) =>
    ["accepted", "preparing", "ready", "delivered"].includes(String(o.status))
  ).length + delivered.length;
  const rejected = cancelled.filter((o) => o.cancelled_by === "merchant").length;
  const pending = active.filter((o) => o.status === "placed").length;
  const acceptanceSample = accepted + rejected + pending;
  const acceptanceRate = acceptanceSample > 0
    ? Math.round((accepted / acceptanceSample) * 100)
    : 100;
  const cancellationRate = (delivered.length + cancelled.length) > 0
    ? Math.round((cancelled.length / (delivered.length + cancelled.length)) * 100)
    : 0;

  const reviews = allOrders
    .filter((o) => o.customer_rating != null)
    .map((o) => ({
      id: String(o.id),
      author: "Customer",
      authorInitial: "C",
      avatarClass: "bg-primary-container text-on-primary-container",
      rating: Number(o.customer_rating),
      daysAgo: Math.max(
        0,
        Math.floor((Date.now() - new Date(String(o.delivered_at || o.created_at)).getTime()) / 86400000),
      ),
      text: String(o.customer_review || ""),
      items: parseOrderItems(o.items).map((i) => i.name),
      needsResponse: !o.customer_review,
    }));

  const ratingSum = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = reviews.length > 0 ? ratingSum / reviews.length : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    percent: reviews.length > 0
      ? Math.round((reviews.filter((r) => r.rating === star).length / reviews.length) * 100)
      : 0,
  }));

  const itemCategoryMap = await buildItemCategoryMap(serviceSb, merchantId);
  const categoryBreakdown = buildCategoryBreakdown(delivered, itemCategoryMap, totalRevenue);
  const revenueByDayOfWeek = buildRevenueByDayOfWeek(delivered);
  const revenueByHour = buildRevenueByHour(delivered);

  c.header("Cache-Control", ANALYTICS_CACHE_CONTROL);
  return c.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    totalOrders,
    totalRevenue,
    avgOrderValue,
    avgPrepTime,
    revenueByBucket,
    orderVolumeByBucket,
    dailySummary: daily,
    topItems,
    categoryBreakdown,
    revenueByDayOfWeek,
    revenueByHour,
    operational: {
      acceptanceRate,
      cancellationRate,
      avgPrepTime,
    },
    reviews,
    avgRating,
    ratingDistribution,
  });
});

// ============================================================================
// Merchant earnings
// ============================================================================

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function orderMerchantNet(order: OrderRow): number {
  // Model A: merchant receivable = total - platform_fee - delivery_fee - tip
  const total = Number(order.total || 0);
  const platformFee = Number(order.platform_fee || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const tip = Number(order.tip || 0);
  if (total > 0) {
    return Math.max(0, Math.round((total - platformFee - deliveryFee - tip) * 100) / 100);
  }
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const tax = Number(order.tax || 0);
  return Math.max(
    0,
    Math.round((subtotal - discount + tax - platformFee) * 100) / 100,
  );
}

function formatEarningsDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEarningsShortDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextPayoutLabel(pendingPayouts: Record<string, unknown>[]): string {
  const pending = pendingPayouts
    .filter((p) => p.status === "pending")
    .sort((a, b) => String(a.period_end || "").localeCompare(String(b.period_end || "")));
  if (pending[0]?.period_end) {
    return formatEarningsShortDate(String(pending[0].period_end));
  }
  const next = new Date();
  const day = next.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  next.setDate(next.getDate() + daysUntilMonday);
  return formatEarningsShortDate(next);
}

app.get("/merchant/earnings", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "payouts");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchant = access.resolved.merchant;
  const merchantId = merchant.id as string;
  const feeResolved = await resolveFeeRateForMerchant(getServiceSupabase(), merchantId);
  const platformFeePercent = feeRateToPercent(feeResolved.rate);

  const sb = getServiceSupabase();
  const { data: orders, error: ordersError } = await sb
    .from("orders")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("status", "delivered");

  if (ordersError) return c.json({ error: ordersError.message }, 500);

  const delivered = (orders || []) as OrderRow[];
  const paymentsSb = getPaymentsSupabase();
  const { data: payouts, error: payoutsError } = await paymentsSb
    .from("merchant_payouts")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });

  if (payoutsError) return c.json({ error: payoutsError.message }, 500);

  const payoutRows = (payouts || []) as Record<string, unknown>[];
  const completedPayoutTotal = payoutRows
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.net_amount || 0), 0);
  const pendingPayoutTotal = payoutRows
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + Number(p.net_amount || 0), 0);

  const lifetimeNet = delivered.reduce((sum, o) => sum + orderMerchantNet(o), 0);
  const currentBalance = Math.max(0, lifetimeNet - completedPayoutTotal - pendingPayoutTotal);

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekOrders = delivered.filter((o) => {
    const placed = new Date(String(o.placed_at || o.created_at));
    return placed >= weekStart && placed <= now;
  });

  const grossSales = weekOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
  const platformFee = weekOrders.reduce((sum, o) => sum + Number(o.platform_fee || 0), 0);
  const netEarnings = weekOrders.reduce((sum, o) => sum + orderMerchantNet(o), 0);

  const weeklyBars = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - index));
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const dayNet = delivered
      .filter((o) => {
        const placed = new Date(String(o.placed_at || o.created_at));
        return placed >= d && placed <= dayEnd;
      })
      .reduce((sum, o) => sum + orderMerchantNet(o), 0);
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return { day: WEEKDAY_SHORT[d.getDay()], net: dayNet, isToday };
  });
  const maxBarNet = Math.max(...weeklyBars.map((b) => b.net), 1);

  const transactions = payoutRows.map((p) => ({
    id: String(p.id),
    title: p.period_end
      ? `${formatEarningsShortDate(String(p.period_end))} Payout`
      : "Payout",
    date: formatEarningsDate(String(p.processed_at || p.created_at)),
    amount: Number(p.net_amount || 0),
    type: "payout" as const,
    payoutId: String(p.id),
  }));

  const cancelledWithRefund = await sb
    .from("orders")
    .select("id, order_number, subtotal, cancelled_at")
    .eq("merchant_id", merchantId)
    .eq("status", "cancelled")
    .not("cancelled_at", "is", null)
    .order("cancelled_at", { ascending: false })
    .limit(10);

  for (const order of cancelledWithRefund.data || []) {
    const row = order as Record<string, unknown>;
    transactions.push({
      id: `refund-${row.id}`,
      title: `Refund - #${row.order_number}`,
      date: formatEarningsDate(String(row.cancelled_at)),
      amount: -Number(row.subtotal || 0),
      type: "refund" as const,
      payoutId: undefined,
    });
  }

  transactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return c.json({
    currentBalance,
    nextPayoutDate: nextPayoutLabel(payoutRows),
    weeklySummary: {
      grossSales,
      platformFeePercent,
      platformFee,
      netEarnings,
    },
    weeklyBars: weeklyBars.map((bar) => ({
      day: bar.day,
      heightPercent: Math.round((bar.net / maxBarNet) * 100),
      isToday: bar.isToday,
    })),
    transactions,
  });
});

app.get("/merchant/earnings/payouts/:id", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "payouts");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchant = access.resolved.merchant;
  const merchantId = merchant.id as string;
  const payoutId = c.req.param("id");
  const feeResolved = await resolveFeeRateForMerchant(getServiceSupabase(), merchantId);
  const platformFeePercent = feeRateToPercent(feeResolved.rate);

  const paymentsSb = getPaymentsSupabase();
  const { data: payout, error } = await paymentsSb
    .from("merchant_payouts")
    .select("*")
    .eq("id", payoutId)
    .eq("merchant_id", merchantId)
    .single();

  if (error || !payout) return c.json({ error: "Payout not found" }, 404);

  const row = payout as Record<string, unknown>;
  const sb = getServiceSupabase();
  let periodOrders: OrderRow[] = [];

  if (row.period_start && row.period_end) {
    const { data: orders } = await sb
      .from("orders")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("status", "delivered")
      .gte("placed_at", `${row.period_start}T00:00:00.000Z`)
      .lte("placed_at", `${row.period_end}T23:59:59.999Z`);
    periodOrders = (orders || []) as OrderRow[];
  }

  const orderEarnings = periodOrders.length > 0
    ? periodOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)
    : Number(row.amount || row.net_amount || 0);
  const tips = periodOrders.reduce((sum, o) => sum + Number(o.tip || 0), 0);
  const platformFee = periodOrders.length > 0
    ? periodOrders.reduce((sum, o) => sum + Number(o.platform_fee || 0), 0)
    : Number(row.fee || 0);
  const netAmount = Number(row.net_amount || 0);
  const adjustments = orderEarnings + tips - platformFee - netAmount;

  const status = String(row.status || "pending");
  const payoutStatus = status === "completed"
    ? "completed"
    : status === "failed"
    ? "failed"
    : "pending";

  return c.json({
    id: String(row.id),
    totalAmount: netAmount,
    status: payoutStatus,
    payoutDate: formatEarningsDate(String(row.processed_at || row.created_at)),
    bankAccountMasked: row.bank_account_last4
      ? `****${row.bank_account_last4}`
      : "****",
    orderEarnings,
    tips,
    adjustments,
    platformFeePercent,
    platformFee,
    netAmount,
  });
});

// ============================================================================
// Merchant promotions
// ============================================================================

function mapPromotion(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    discountPercent: row.discount_percent != null
      ? Number(row.discount_percent)
      : undefined,
    discountAmount: row.discount_amount != null
      ? Number(row.discount_amount)
      : undefined,
    minOrder: row.min_order != null ? Number(row.min_order) : undefined,
    appliesTo: row.applies_to ? String(row.applies_to) : undefined,
    promoCode: row.promo_code ? String(row.promo_code) : undefined,
    customerEligibility: row.customer_eligibility
      ? String(row.customer_eligibility)
      : undefined,
    dateStart: String(row.date_start).slice(0, 10),
    dateEnd: row.date_end ? String(row.date_end).slice(0, 10) : undefined,
    usageLimitPerCustomer: row.usage_limit_per_customer != null
      ? Number(row.usage_limit_per_customer)
      : undefined,
    redemptions: Number(row.redemptions || 0),
    status: String(row.status),
  };
}

function buildWeeklyRedemptions(promotions: Record<string, unknown>[]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - index));
    const label = WEEKDAY_SHORT[d.getDay()];
    // Orders do not store promo_code yet; chart reflects stored redemption counters only.
    const redemptions = promotions.reduce(
      (sum, p) => sum + Number(p.redemptions || 0),
      0,
    );
    return {
      day: label,
      redemptions: index === 6 ? redemptions : 0,
      sales: 0,
    };
  });
}

app.get("/merchant/promotions", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  const { data, error } = await supabase
    .from("merchant_promotions")
    .select("*")
    .eq("merchant_id", merchant.id as string)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);

  const rows = (data || []) as Record<string, unknown>[];
  return c.json({
    promotions: rows.map(mapPromotion),
    weeklyRedemptions: buildWeeklyRedemptions(rows),
  });
});

app.post("/merchant/promotions", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  const body = await c.req.json();
  const promoCode = String(body.promoCode || "").trim().toUpperCase();
  if (!promoCode) return c.json({ error: "Promo code is required" }, 400);
  if (!body.title) return c.json({ error: "Title is required" }, 400);
  if (!body.type) return c.json({ error: "Type is required" }, 400);
  if (String(body.type) === "bogo") {
    return c.json({ error: "BOGO promotions are not available yet" }, 400);
  }
  if (!body.dateStart) return c.json({ error: "Start date is required" }, 400);

  const { data, error } = await supabase
    .from("merchant_promotions")
    .insert({
      merchant_id: merchant.id as string,
      type: body.type,
      title: body.title,
      discount_percent: body.discountPercent ?? null,
      discount_amount: body.discountAmount ?? null,
      min_order: body.minOrder ?? null,
      applies_to: body.appliesTo || "entire_order",
      promo_code: promoCode,
      customer_eligibility: body.customerEligibility || "all",
      date_start: body.dateStart,
      date_end: body.dateEnd || null,
      usage_limit_per_customer: body.usageLimitPerCustomer ?? null,
      status: body.status || "active",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ promotion: mapPromotion(data as Record<string, unknown>) }, 201);
});

app.patch("/merchant/promotions/:id", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  const promotionId = c.req.param("id");
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status != null) {
    const status = String(body.status).toLowerCase();
    if (!["active", "paused", "ended", "scheduled"].includes(status)) {
      return c.json({ error: "status must be active, paused, ended, or scheduled" }, 400);
    }
    updates.status = status;
  }
  if (body.title != null) updates.title = body.title;
  if (body.dateEnd != null) updates.date_end = body.dateEnd;

  const { data, error } = await supabase
    .from("merchant_promotions")
    .update(updates)
    .eq("id", promotionId)
    .eq("merchant_id", merchant.id as string)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ promotion: mapPromotion(data as Record<string, unknown>) });
});

// ============================================================================
// Merchant web push subscriptions
// ============================================================================

app.post("/merchant/push/subscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  const body = await c.req.json();
  const nativePlatform = body.platform as string | undefined;
  const nativeToken = typeof body.token === "string" ? body.token.trim() : "";

  // Capacitor FCM/APNs device token
  if (nativeToken && (nativePlatform === "fcm" || nativePlatform === "apns")) {
    const endpoint = `${nativePlatform}:${nativeToken}`;
    const { error } = await supabase
      .from("merchant_push_subscriptions")
      .upsert({
        merchant_id: merchant.id,
        user_id: user.id,
        endpoint,
        channel: nativePlatform,
        p256dh: null,
        auth: null,
        user_agent: c.req.header("User-Agent") || null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, channel: nativePlatform });
  }

  const endpoint = body.endpoint as string;
  const keys = body.keys as { p256dh?: string; auth?: string };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: "Invalid subscription payload" }, 400);
  }

  const { error } = await supabase
    .from("merchant_push_subscriptions")
    .upsert({
      merchant_id: merchant.id,
      user_id: user.id,
      endpoint,
      channel: "web",
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: c.req.header("User-Agent") || null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true, channel: "web" });
});

app.delete("/merchant/push/unsubscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const endpoint = body.endpoint as string | undefined;

  let query = supabase
    .from("merchant_push_subscriptions")
    .delete()
    .eq("merchant_id", merchant.id);

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

app.post("/merchant/push/test", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const merchant = await getMerchantForUser(supabase, user.id, user.email);
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);

  // Actual send is handled by merchant-push edge function in production
  return c.json({
    ok: true,
    message: "Test notification queued",
    merchantId: merchant.id,
  });
});

// ============================================================================
// Merchant-side: notifications feed
// ============================================================================

app.get("/merchant/notifications", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Find merchant for this user
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!merchant) return c.json({ notifications: [] });

  const { data, error } = await supabase
    .from("merchant_notifications")
    .select("*")
    .eq("merchant_id", (merchant as Record<string, unknown>).id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ notifications: data || [] });
});

app.post("/merchant/notifications/:id/read", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const supabase = getSupabase(authHeader);
  const { id } = c.req.param();
  const { error } = await supabase
    .from("merchant_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

import { registerMerchantApplicationRoutes } from "./merchant_application_routes.ts";
import { registerMerchantAssetsRoutes } from "./merchantAssetsUpload.ts";
import { registerPartnerBusinessTypeRoutes } from "./admin/onboardingConfigRoutes.ts";
import { registerDashboardAdminRoutes } from "./admin/dashboardRoutes.ts";
import { registerCourierAdminRoutes } from "./admin/courierRoutes.ts";
import { registerMerchantAdminRoutes } from "./admin/merchantRoutes.ts";
import { registerOrderAdminRoutes } from "./admin/orderRoutes.ts";
import { registerCustomerAdminRoutes } from "./admin/customerRoutes.ts";
import { registerIdentityAdminRoutes } from "./admin/identityRoutes.ts";
import { registerFinanceAdminRoutes } from "./admin/financeRoutes.ts";
import { registerMarketAdminRoutes, registerPublicGeoRoutes } from "./admin/marketRoutes.ts";
import { registerOpsAdminRoutes } from "./admin/opsRoutes.ts";
import { registerPricingAdminRoutes } from "./admin/pricingRoutes.ts";
import { registerSupportAdminRoutes } from "./admin/supportRoutes.ts";
import { registerOrderChatRoutes } from "./orderChat.ts";
import { registerAdminOrderChatRoutes } from "./admin/orderChatRoutes.ts";
registerCustomerOrderRoutes(app, { getSupabase, getServiceSupabase });
registerOrderChatRoutes(app, { getSupabase, getServiceSupabase, getPublicServiceSupabase });
registerAdminOrderChatRoutes(app);
registerCustomerAccountRoutes(app, { getSupabase, getServiceSupabase });
registerCustomerDiscoveryRoutes(app, { getServiceSupabase, getSupabase });
registerCourierConsumerRoutes(app, { getSupabase, getServiceSupabase });
registerDashHealthRoutes(app, { getServiceSupabase });
registerStripeConnectRoutes(app, { getSupabase, getServiceSupabase });
registerMerchantApplicationRoutes(app);
registerMerchantAssetsRoutes(app);
registerMerchantTeamRoutes(app, { getSupabase, getServiceSupabase });
registerMerchantStationRoutes(app, { getSupabase, getServiceSupabase });
registerMerchantVenueOpsRoutes(app, { getSupabase, getServiceSupabase });
registerMerchantRestaurantRoutes(app);
registerMerchantInventoryRoutes(app);
registerPartnerBusinessTypeRoutes(app);
registerDashboardAdminRoutes(app);
registerMerchantAdminRoutes(app);
registerOrderAdminRoutes(app);
registerCustomerAdminRoutes(app);
registerIdentityAdminRoutes(app);
registerFinanceAdminRoutes(app);
registerCourierAdminRoutes(app);
registerMarketAdminRoutes(app);
registerOpsAdminRoutes(app);
registerPricingAdminRoutes(app);
registerSupportAdminRoutes(app);
registerPublicGeoRoutes(app, { getServiceSupabase });

Deno.serve(app.fetch);
