/**
 * Customer discovery: promotions list/redeem + merchant/menu search.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateBody, z } from "../_shared/validateBody.ts";

export type CustomerDiscoveryDeps = {
  getServiceSupabase: () => SupabaseClient;
  getSupabase: (authHeader: string) => SupabaseClient;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type PromoRow = {
  id: string;
  merchant_id: string;
  type: string;
  title: string;
  discount_percent: number | null;
  discount_amount: number | null;
  min_order: number | null;
  promo_code: string;
  date_start: string;
  date_end: string | null;
  status: string;
  redemptions?: number | null;
  merchant?: { id?: string; name?: string } | null;
};

export function computePromoDiscount(promo: PromoRow, subtotal: number): number {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  if (promo.type === "percent_off" && promo.discount_percent != null) {
    return roundMoney(safeSubtotal * (Number(promo.discount_percent) / 100));
  }
  if (promo.type === "amount_off" && promo.discount_amount != null) {
    return roundMoney(Math.min(safeSubtotal, Number(promo.discount_amount)));
  }
  // free_delivery: line discount $0 — fee waived via freeDelivery flag on pricing resolver
  // bogo: not implemented — returns $0 and must not be advertised as working
  return 0;
}

export function isFreeDeliveryPromo(promo: { type?: string } | null | undefined): boolean {
  return String(promo?.type || "").toLowerCase() === "free_delivery";
}

function isPromoCurrentlyActive(promo: PromoRow, now = new Date()): boolean {
  if (promo.status !== "active") return false;
  const start = new Date(promo.date_start);
  if (Number.isFinite(start.getTime()) && start > now) return false;
  if (promo.date_end) {
    const end = new Date(promo.date_end);
    // Inclusive end-of-day
    end.setHours(23, 59, 59, 999);
    if (Number.isFinite(end.getTime()) && end < now) return false;
  }
  return true;
}

/** Accept merchant UUID or public slug (cart often stores slug). */
async function resolveMerchantUuid(
  serviceSb: SupabaseClient,
  merchantIdOrSlug: string,
): Promise<string | null> {
  const key = merchantIdOrSlug.trim();
  if (!key) return null;
  const byId = await serviceSb.from("merchants").select("id").eq("id", key).maybeSingle();
  if (byId.data?.id) return String(byId.data.id);
  const bySlug = await serviceSb.from("merchants").select("id").eq("slug", key).maybeSingle();
  return bySlug.data?.id ? String(bySlug.data.id) : null;
}

export async function resolveActivePromoByCode(
  serviceSb: SupabaseClient,
  code: string,
  merchantId?: string | null,
): Promise<{ ok: true; promo: PromoRow } | { ok: false; error: string; status: number }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Promo code required", status: 400 };

  let resolvedMerchantId: string | null = null;
  if (merchantId) {
    resolvedMerchantId = await resolveMerchantUuid(serviceSb, merchantId);
    if (!resolvedMerchantId) {
      return { ok: false, error: "Merchant not found for this promo", status: 404 };
    }
  }

  let query = serviceSb
    .from("merchant_promotions")
    .select(
      "id, merchant_id, type, title, discount_percent, discount_amount, min_order, promo_code, date_start, date_end, status, redemptions, merchant:merchants(id, name)",
    )
    .ilike("promo_code", normalized)
    .eq("status", "active")
    .limit(5);

  if (resolvedMerchantId) {
    query = query.eq("merchant_id", resolvedMerchantId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message, status: 500 };

  const rows = (data || []) as PromoRow[];
  const promo = rows.find((row) => row.promo_code.toUpperCase() === normalized && isPromoCurrentlyActive(row));
  if (!promo) return { ok: false, error: "Invalid or expired promo code", status: 404 };

  // Economy tier is not promo-eligible by default
  const mid = resolvedMerchantId || String(promo.merchant_id);
  const { data: merchant } = await serviceSb
    .from("merchants")
    .select("pricing_tier_id, pricing_tier:merchant_tiers(promo_eligible)")
    .eq("id", mid)
    .maybeSingle();
  const tier = merchant?.pricing_tier as { promo_eligible?: boolean } | null;
  if (tier && tier.promo_eligible === false) {
    return {
      ok: false,
      error: "This restaurant’s plan does not include promotions",
      status: 400,
    };
  }

  return { ok: true, promo };
}

const RedeemBody = z.object({
  code: z.string().min(1),
  merchantId: z.string().optional(),
  subtotal: z.coerce.number().optional(),
});

export function registerCustomerDiscoveryRoutes(app: Hono, deps: CustomerDiscoveryDeps) {
  const { getServiceSupabase, getSupabase } = deps;

  // Active merchant promotions (customer-facing)
  app.get("/promotions", async (c) => {
    const serviceSb = getServiceSupabase();
    const merchantIdRaw = c.req.query("merchantId");
    const merchantId = merchantIdRaw
      ? await resolveMerchantUuid(serviceSb, merchantIdRaw)
      : null;
    if (merchantIdRaw && !merchantId) {
      return c.json({ promotions: [] });
    }

    let query = serviceSb
      .from("merchant_promotions")
      .select(
        "id, merchant_id, type, title, discount_percent, discount_amount, min_order, promo_code, date_start, date_end, status, merchant:merchants(id, name)",
      )
      .eq("status", "active")
      .order("date_start", { ascending: false })
      .limit(50);

    if (merchantId) query = query.eq("merchant_id", merchantId);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    const now = new Date();
    const promotions = ((data || []) as PromoRow[])
      .filter((row) => isPromoCurrentlyActive(row, now))
      // Do not advertise unimplemented BOGO deals
      .filter((row) => String(row.type).toLowerCase() !== "bogo")
      .map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        merchantName: row.merchant?.name ?? null,
        type: row.type,
        title: row.title,
        discountPercent: row.discount_percent != null ? Number(row.discount_percent) : null,
        discountAmount: row.discount_amount != null ? Number(row.discount_amount) : null,
        minOrder: row.min_order != null ? Number(row.min_order) : null,
        promoCode: row.promo_code,
        dateStart: row.date_start,
        dateEnd: row.date_end,
      }));

    return c.json({ promotions });
  });

  // Validate promo and return computed discount for a cart subtotal
  app.post("/promotions/redeem", async (c) => {
    const body = await validateBody(c, RedeemBody);
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const resolved = await resolveActivePromoByCode(serviceSb, body.code, body.merchantId);
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status);

    const promo = resolved.promo;
    if (String(promo.type).toLowerCase() === "bogo") {
      return c.json({ error: "This promotion type is not available yet" }, 400);
    }
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    if (promo.min_order != null && subtotal < Number(promo.min_order)) {
      return c.json({
        error: `Minimum order J$${Number(promo.min_order).toFixed(0)} required`,
      }, 400);
    }

    const discount = computePromoDiscount(promo, subtotal);
    return c.json({
      promo: {
        id: promo.id,
        code: promo.promo_code,
        title: promo.title,
        type: promo.type,
        merchantId: promo.merchant_id,
        discountPercent: promo.discount_percent != null ? Number(promo.discount_percent) : null,
        discountAmount: promo.discount_amount != null ? Number(promo.discount_amount) : null,
        minOrder: promo.min_order != null ? Number(promo.min_order) : null,
        freeDelivery: isFreeDeliveryPromo(promo),
      },
      discount,
      freeDelivery: isFreeDeliveryPromo(promo),
    });
  });

  // Merchant + menu item search (ilike) — same-town filter when pin provided
  app.get("/search", async (c) => {
    const q = String(c.req.query("q") || "").trim();
    if (q.length < 2) {
      return c.json({ merchants: [], items: [] });
    }

    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const serviceSb = getServiceSupabase();
    const lat = c.req.query("lat");
    const lng = c.req.query("lng");
    const { resolveActiveMarketIdFromPin, merchantMatchesDiscoveryPin } = await import(
      "./discoveryMarketFilter.ts"
    );
    const pin = await resolveActiveMarketIdFromPin(serviceSb, lat, lng);
    if (pin.missingPin || !pin.covered || pin.marketIds.length === 0) {
      return c.json({
        merchants: [],
        items: [],
        query: q,
        out_of_coverage: !pin.missingPin,
        missing_pin: pin.missingPin,
      });
    }

    let merchantQuery = serviceSb
      .from("merchants")
      .select("id, name, logo_url, cover_image_url, cuisine_type, rating, avg_prep_time_mins, delivery_fee, min_order_amount, market_id, lat, lng, delivery_radius_km, pricing_tier_id, pricing_tier:merchant_tiers(search_boost, slug, default_delivery_radius_km, auto_ads)")
      .eq("is_active", true)
      .eq("is_accepting_orders", true)
      .or(`name.ilike."${pattern}",cuisine_type.ilike."${pattern}"`)
      .limit(40);

    if (pin.parishBoundaryMode) {
      merchantQuery = merchantQuery.in("market_id", pin.marketIds);
    } else {
      merchantQuery = merchantQuery.eq("market_id", pin.marketId);
    }

    const [merchantsRes, itemsRes] = await Promise.all([
      merchantQuery,
      serviceSb
        .from("menu_items")
        .select(
          "id, name, description, price, marketplace_price, in_store_price, image_url, merchant_id, merchant:merchants!inner(id, name, logo_url, is_active, is_accepting_orders, market_id)",
        )
        .eq("is_available", true)
        .ilike("name", pattern)
        .limit(30),
    ]);

    if (merchantsRes.error) return c.json({ error: merchantsRes.error.message }, 500);
    if (itemsRes.error) return c.json({ error: itemsRes.error.message }, 500);

    const { resolveDeliveryFee, haversineKm, roundDistanceKm } = await import("../_shared/dashPricing.ts");
    const { resolvePricingLayers } = await import("./pricingLayers.ts");
    const layered = await resolvePricingLayers(serviceSb, {
      marketId: pin.parishBoundaryMode ? pin.marketIds[0] ?? null : pin.marketId,
    });
    const pinLat = Number(lat);
    const pinLng = Number(lng);
    const hasPin = Number.isFinite(pinLat) && Number.isFinite(pinLng);

    const merchants = (merchantsRes.data || [])
      .map((m: Record<string, unknown>) => {
        const tier = m.pricing_tier as Record<string, unknown> | null;
        const boost = tier?.search_boost != null ? Number(tier.search_boost) : 0;
        const autoAds = Boolean(tier?.auto_ads);
        const isPromoted = autoAds || boost > 0;
        const deliveryFee = resolveDeliveryFee(layered.rules.delivery, null);

        let distanceKmRaw: number | null = null;
        if (hasPin && m.lat != null && m.lng != null) {
          const mLat = Number(m.lat);
          const mLng = Number(m.lng);
          if (Number.isFinite(mLat) && Number.isFinite(mLng)) {
            distanceKmRaw = roundDistanceKm(haversineKm(mLat, mLng, pinLat, pinLng));
          }
        }

        const merchantRadius = m.delivery_radius_km != null ? Number(m.delivery_radius_km) : NaN;
        const tierRadius = tier?.default_delivery_radius_km != null
          ? Number(tier.default_delivery_radius_km)
          : NaN;
        const radiusCandidates = [merchantRadius, tierRadius].filter(
          (n) => Number.isFinite(n) && n > 0,
        );
        if (
          hasPin &&
          distanceKmRaw != null &&
          radiusCandidates.length > 0 &&
          distanceKmRaw > Math.min(...radiusCandidates)
        ) {
          return null;
        }

        return {
          id: String(m.id),
          name: String(m.name ?? ""),
          logoUrl: m.logo_url ? String(m.logo_url) : null,
          coverImageUrl: m.cover_image_url ? String(m.cover_image_url) : null,
          cuisineType: m.cuisine_type ? String(m.cuisine_type) : null,
          rating: m.rating != null ? Number(m.rating) : null,
          etaMins: m.avg_prep_time_mins != null ? Number(m.avg_prep_time_mins) : null,
          deliveryFee,
          delivery_fee: deliveryFee,
          minOrderAmount: m.min_order_amount != null ? Number(m.min_order_amount) : null,
          search_boost: boost,
          auto_ads: autoAds,
          is_promoted: isPromoted,
          promoted: isPromoted,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m != null)
      .sort((a, b) => {
        const autoDiff = Number(b.auto_ads) - Number(a.auto_ads);
        if (autoDiff !== 0) return autoDiff;
        return (b.search_boost ?? 0) - (a.search_boost ?? 0);
      })
      .slice(0, 20);

    const items = (itemsRes.data || [])
      .filter((row: Record<string, unknown>) => {
        const merchant = row.merchant as Record<string, unknown> | null;
        return merchant?.is_active && merchant?.is_accepting_orders &&
          merchantMatchesDiscoveryPin(
            merchant?.market_id != null ? String(merchant.market_id) : null,
            pin,
          );
      })
      .map((row: Record<string, unknown>) => {
        const merchant = (row.merchant as Record<string, unknown>) || {};
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          price: Number(row.marketplace_price ?? row.price ?? 0),
          marketplace_price: Number(row.marketplace_price ?? row.price ?? 0),
          imageUrl: row.image_url ? String(row.image_url) : null,
          merchantId: String(row.merchant_id ?? merchant.id ?? ""),
          merchantName: String(merchant.name ?? ""),
          merchantLogo: merchant.logo_url ? String(merchant.logo_url) : null,
        };
      });

    return c.json({
      merchants,
      items,
      query: q,
      market_id: pin.marketId,
      parish_id: pin.parishId,
      parish_boundary_mode: pin.parishBoundaryMode,
    });
  });

  // Public merchant reviews from completed customer ratings (no fake names)
  app.get("/merchants/:id/reviews", async (c) => {
    const rawId = String(c.req.param("id") || "").trim();
    if (!rawId) return c.json({ error: "Merchant required" }, 400);

    const serviceSb = getServiceSupabase();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
    const merchantQuery = uuid
      ? serviceSb.from("merchants").select("id, name, rating").eq("id", rawId)
      : serviceSb.from("merchants").select("id, name, rating").eq("slug", rawId);
    const { data: merchant, error: merchantError } = await merchantQuery.maybeSingle();
    if (merchantError) return c.json({ error: merchantError.message }, 500);
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    const { data: rows, error } = await serviceSb
      .from("orders")
      .select("id, customer_rating, customer_review, delivered_at, created_at, review_hidden")
      .eq("merchant_id", merchant.id)
      .in("status", ["delivered", "completed"])
      .not("customer_rating", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(50);

    if (error) return c.json({ error: error.message }, 500);

    const visible = (rows ?? []).filter((row) => !row.review_hidden);
    const ids = visible.map((row) => String(row.id));

    const helpfulCounts = new Map<string, number>();
    const votedIds = new Set<string>();
    if (ids.length) {
      const { data: votes } = await serviceSb
        .from("review_votes")
        .select("order_id, customer_id")
        .in("order_id", ids);
      for (const vote of votes ?? []) {
        const orderId = String((vote as { order_id: string }).order_id);
        helpfulCounts.set(orderId, (helpfulCounts.get(orderId) ?? 0) + 1);
      }

      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        const { data: { user } } = await getSupabase(authHeader).auth.getUser();
        if (user) {
          const { data: customer } = await serviceSb
            .from("customers")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (customer) {
            for (const vote of votes ?? []) {
              if (String((vote as { customer_id: string }).customer_id) === String(customer.id)) {
                votedIds.add(String((vote as { order_id: string }).order_id));
              }
            }
          }
        }
      }
    }

    const reviews = visible.map((row) => ({
      id: String(row.id),
      rating: Number(row.customer_rating),
      comment: String(row.customer_review || "").trim(),
      at: String(row.delivered_at || row.created_at || ""),
      helpfulCount: helpfulCounts.get(String(row.id)) ?? 0,
      voted: votedIds.has(String(row.id)),
    }));

    const ratingSum = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = reviews.length
      ? Math.round((ratingSum / reviews.length) * 10) / 10
      : Number(merchant.rating ?? 0);
    const distribution = [5, 4, 3, 2, 1].map(
      (star) => reviews.filter((r) => r.rating === star).length,
    );

    return c.json({
      merchantId: merchant.id,
      merchantName: merchant.name,
      rating: avgRating,
      reviewCount: reviews.length,
      distribution,
      reviews,
    });
  });

  async function requireCustomer(authHeader: string | undefined) {
    if (!authHeader) return { error: "Unauthorized" as const, status: 401 as const };
    const { data: { user } } = await getSupabase(authHeader).auth.getUser();
    if (!user) return { error: "Unauthorized" as const, status: 401 as const };
    const serviceSb = getServiceSupabase();
    const { data: customer } = await serviceSb
      .from("customers")
      .select("id, email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!customer) return { error: "Customer not found" as const, status: 404 as const };
    return { user, customer, serviceSb };
  }

  app.post("/merchants/:id/reviews/:orderId/helpful", async (c) => {
    const auth = await requireCustomer(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const orderId = String(c.req.param("orderId") || "").trim();
    const merchantId = String(c.req.param("id") || "").trim();
    if (!orderId || !merchantId) return c.json({ error: "Review required" }, 400);

    const { data: order } = await auth.serviceSb
      .from("orders")
      .select("id, merchant_id, customer_id, customer_rating, review_hidden")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || !order.customer_rating || order.review_hidden) {
      return c.json({ error: "Review not found" }, 404);
    }
    if (String(order.customer_id) === String(auth.customer.id)) {
      return c.json({ error: "You cannot mark your own review helpful" }, 400);
    }

    const { data: existing } = await auth.serviceSb
      .from("review_votes")
      .select("order_id")
      .eq("order_id", order.id)
      .eq("customer_id", auth.customer.id)
      .maybeSingle();

    if (existing) {
      await auth.serviceSb
        .from("review_votes")
        .delete()
        .eq("order_id", order.id)
        .eq("customer_id", auth.customer.id);
    } else {
      const { error } = await auth.serviceSb.from("review_votes").insert({
        order_id: order.id,
        customer_id: auth.customer.id,
      });
      if (error) return c.json({ error: error.message }, 500);
    }

    const { count } = await auth.serviceSb
      .from("review_votes")
      .select("order_id", { count: "exact", head: true })
      .eq("order_id", order.id);

    return c.json({ voted: !existing, helpfulCount: count ?? 0 });
  });

  app.post("/merchants/:id/reviews/:orderId/report", async (c) => {
    const auth = await requireCustomer(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const orderId = String(c.req.param("orderId") || "").trim();
    if (!orderId) return c.json({ error: "Review required" }, 400);

    const { data: order } = await auth.serviceSb
      .from("orders")
      .select("id, merchant_id, order_number, customer_rating")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.customer_rating == null) return c.json({ error: "Review not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const { error } = await auth.serviceSb.from("support_cases").insert({
      subject: `Reported review — ${order.order_number || order.id}`,
      body: reason || "Customer reported a store review as inappropriate.",
      status: "open",
      priority: "normal",
      customer_id: auth.customer.id,
      order_id: order.id,
      contact_email: (auth.customer.email as string | null) || auth.user.email || null,
      created_by: auth.user.id,
    });
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ ok: true });
  });
}
