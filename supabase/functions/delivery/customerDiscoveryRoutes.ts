/**
 * Customer discovery: promotions list/redeem + merchant/menu search.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateBody, z } from "../_shared/validateBody.ts";

export type CustomerDiscoveryDeps = {
  getServiceSupabase: () => SupabaseClient;
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
  // free_delivery / bogo: no line discount (delivery fee already server-controlled)
  return 0;
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

export async function resolveActivePromoByCode(
  serviceSb: SupabaseClient,
  code: string,
  merchantId?: string | null,
): Promise<{ ok: true; promo: PromoRow } | { ok: false; error: string; status: number }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Promo code required", status: 400 };

  let query = serviceSb
    .from("merchant_promotions")
    .select(
      "id, merchant_id, type, title, discount_percent, discount_amount, min_order, promo_code, date_start, date_end, status, redemptions, merchant:merchants(id, name)",
    )
    .ilike("promo_code", normalized)
    .eq("status", "active")
    .limit(5);

  if (merchantId) {
    query = query.eq("merchant_id", merchantId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message, status: 500 };

  const rows = (data || []) as PromoRow[];
  const promo = rows.find((row) => row.promo_code.toUpperCase() === normalized && isPromoCurrentlyActive(row));
  if (!promo) return { ok: false, error: "Invalid or expired promo code", status: 404 };
  return { ok: true, promo };
}

const RedeemBody = z.object({
  code: z.string().min(1),
  merchantId: z.string().optional(),
  subtotal: z.coerce.number().optional(),
});

export function registerCustomerDiscoveryRoutes(app: Hono, deps: CustomerDiscoveryDeps) {
  const { getServiceSupabase } = deps;

  // Active merchant promotions (customer-facing)
  app.get("/promotions", async (c) => {
    const serviceSb = getServiceSupabase();
    const merchantId = c.req.query("merchantId");

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
      },
      discount,
    });
  });

  // Merchant + menu item search (ilike)
  app.get("/search", async (c) => {
    const q = String(c.req.query("q") || "").trim();
    if (q.length < 2) {
      return c.json({ merchants: [], items: [] });
    }

    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const serviceSb = getServiceSupabase();

    const [merchantsRes, itemsRes] = await Promise.all([
      serviceSb
        .from("merchants")
        .select("id, name, logo_url, cover_image_url, cuisine_type, rating, avg_prep_time_mins, delivery_fee, min_order_amount")
        .eq("is_active", true)
        .eq("is_accepting_orders", true)
        .or(`name.ilike."${pattern}",cuisine_type.ilike."${pattern}"`)
        .limit(20),
      serviceSb
        .from("menu_items")
        .select(
          "id, name, description, price, image_url, merchant_id, merchant:merchants!inner(id, name, logo_url, is_active, is_accepting_orders)",
        )
        .eq("is_available", true)
        .ilike("name", pattern)
        .limit(30),
    ]);

    if (merchantsRes.error) return c.json({ error: merchantsRes.error.message }, 500);
    if (itemsRes.error) return c.json({ error: itemsRes.error.message }, 500);

    const merchants = (merchantsRes.data || []).map((m: Record<string, unknown>) => ({
      id: String(m.id),
      name: String(m.name ?? ""),
      logoUrl: m.logo_url ? String(m.logo_url) : null,
      coverImageUrl: m.cover_image_url ? String(m.cover_image_url) : null,
      cuisineType: m.cuisine_type ? String(m.cuisine_type) : null,
      rating: m.rating != null ? Number(m.rating) : null,
      etaMins: m.avg_prep_time_mins != null ? Number(m.avg_prep_time_mins) : null,
      deliveryFee: m.delivery_fee != null ? Number(m.delivery_fee) : null,
      minOrderAmount: m.min_order_amount != null ? Number(m.min_order_amount) : null,
    }));

    const items = (itemsRes.data || [])
      .filter((row: Record<string, unknown>) => {
        const merchant = row.merchant as Record<string, unknown> | null;
        return merchant?.is_active && merchant?.is_accepting_orders;
      })
      .map((row: Record<string, unknown>) => {
        const merchant = (row.merchant as Record<string, unknown>) || {};
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          price: Number(row.price ?? 0),
          imageUrl: row.image_url ? String(row.image_url) : null,
          merchantId: String(row.merchant_id ?? merchant.id ?? ""),
          merchantName: String(merchant.name ?? ""),
          merchantLogo: merchant.logo_url ? String(merchant.logo_url) : null,
        };
      });

    return c.json({ merchants, items, query: q });
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

    const reviews = (rows ?? [])
      .filter((row) => !row.review_hidden)
      .map((row) => ({
        id: String(row.id),
        rating: Number(row.customer_rating),
        comment: String(row.customer_review || "").trim(),
        at: String(row.delivered_at || row.created_at || ""),
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
}
