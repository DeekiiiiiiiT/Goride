/**
 * Customer-facing order routes (place, detail, history).
 * Extracted from delivery/index.ts for maintainability — behavior identical.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateOrderPricing } from "../_shared/orderPricing.ts";
import { getFlag } from "../_shared/featureFlags.ts";
import { requireResolvedMerchantWithPermission } from "./merchantAuth.ts";
import { validateBody, z } from "../_shared/validateBody.ts";
import {
  computePromoDiscount,
  resolveActivePromoByCode,
} from "./customerDiscoveryRoutes.ts";
import {
  loadDashGlobalPlatformFeeRate,
  resolveDashPlatformFeeRate,
} from "./platformFeeRate.ts";
import { assertMerchantAcceptingOrders } from "./merchantOpenCheck.ts";
import { ORDER_CUSTOMER_EMBED_WITH_USER } from "./orderSelectEmbeds.ts";

function asCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

const ORDER_ID_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns 503 body code when idempotency migration has not been applied yet. */
function idempotencyInfrastructureError(error: { message?: string } | null | undefined): string | null {
  const msg = String(error?.message ?? "").toLowerCase();
  if (!msg.includes("order_idempotency_keys")) return null;
  if (msg.includes("does not exist") || msg.includes("schema cache")) {
    return "orders_idempotency_not_ready";
  }
  return null;
}

const PlaceOrderBody = z.object({
  merchantId: z.string().min(1),
  items: z.array(z.unknown()).min(1),
  customerName: z.string().optional(),
  phone: z.string().optional(),
  tip: z.coerce.number().optional(),
  deliveryAddress: z.unknown().optional(),
  deliveryLat: z.unknown().optional(),
  deliveryLng: z.unknown().optional(),
  deliveryInstructions: z.unknown().optional(),
  paymentMethod: z.string().optional(),
  promoCode: z.string().optional(),
}).passthrough();

export type CustomerOrderRoutesDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

export function registerCustomerOrderRoutes(app: Hono, deps: CustomerOrderRoutesDeps) {
  const { getSupabase, getServiceSupabase } = deps;

  // Place new order
  app.post("/orders", async (c) => {
    if (!(await getFlag("DELIVERY_CUSTOMER_ORDERS_ENABLED", true))) {
      return c.json({ error: "orders_disabled" }, 503);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await validateBody(c, PlaceOrderBody);
    if (body instanceof Response) return body;

    const idempotencyKeyRaw = c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
    const idempotencyKey = idempotencyKeyRaw?.trim() ? idempotencyKeyRaw.trim() : null;
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
      return c.json({ error: "Invalid idempotency key" }, 400);
    }

    // Enforce accepting + hours + holiday specials before pricing/insert
    const openCheck = await assertMerchantAcceptingOrders(getServiceSupabase(), body.merchantId);
    if (!openCheck.ok) {
      return c.json({ error: openCheck.error }, openCheck.status);
    }

    // Get or create customer — enforce suspend before pricing/insert
    let { data: customer } = await supabase
      .from("customers")
      .select("id, account_status, default_lat, default_lng")
      .eq("user_id", user.id)
      .maybeSingle();

    if (customer && String((customer as { account_status?: string }).account_status) === "suspended") {
      return c.json({ error: "Account suspended" }, 403);
    }

    if (!customer) {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          user_id: user.id,
          name: body.customerName || user.email?.split("@")[0] || "Customer",
          phone: body.phone,
          email: user.email,
        })
        .select("id, account_status, default_lat, default_lng")
        .single();

      if (customerError) return c.json({ error: customerError.message }, 500);
      customer = newCustomer;
    }

    const rawItems = body.items as Array<{
      id?: string;
      menuItemId?: string;
      item_id?: string;
      quantity?: number;
      modifiers?: unknown[];
    }>;

    // Server-side prices from menu_items — never trust client unit prices / discount
    const serviceSb = getServiceSupabase();
    const menuItemIds = [...new Set(rawItems.map((item) =>
      String(item.menuItemId || item.id || item.item_id || ""),
    ).filter(Boolean))];
    if (menuItemIds.length === 0) return c.json({ error: "Invalid menu item ids" }, 400);

    const { data: menuRows, error: menuErr } = await serviceSb
      .from("menu_items")
      .select("id, name, price, is_available, merchant_id")
      .eq("merchant_id", body.merchantId)
      .in("id", menuItemIds);

    if (menuErr) return c.json({ error: menuErr.message }, 500);
    const menuById = new Map((menuRows || []).map((row) => [String(row.id), row]));

    const pricedLines: Array<{
      menuItemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      modifiers?: Array<{ name: string; priceAdjustment: number }>;
    }> = [];
    const orderItems: Record<string, unknown>[] = [];

    for (const item of rawItems) {
      const menuItemId = String(item.menuItemId || item.id || item.item_id || "");
      const menuRow = menuById.get(menuItemId);
      if (!menuRow || !menuRow.is_available) {
        return c.json({ error: `Unavailable menu item: ${menuItemId}` }, 400);
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 0));
      if (!quantity) return c.json({ error: "Invalid quantity" }, 400);
      const unitPrice = Number(menuRow.price);
      const modifiers = Array.isArray(item.modifiers)
        ? item.modifiers.map((m: { name?: string; priceAdjustment?: number }) => ({
            name: String(m.name || ""),
            // Modifier adjustments still come from client until options are DB-backed;
            // clamp to non-negative to block negative-price abuse.
            priceAdjustment: Math.max(0, Number(m.priceAdjustment) || 0),
          }))
        : undefined;
      pricedLines.push({
        menuItemId,
        name: String(menuRow.name),
        unitPrice,
        quantity,
        modifiers,
      });
      orderItems.push({
        id: menuItemId,
        menuItemId,
        name: menuRow.name,
        price: unitPrice,
        quantity,
        ...(modifiers ? { modifiers } : {}),
      });
    }

    // Promo: re-validate server-side — never trust client discount amounts
    let discount = 0;
    let appliedPromoCode: string | null = null;
    const requestedPromo = typeof body.promoCode === "string" ? body.promoCode.trim() : "";
    if (requestedPromo) {
      const provisionalSubtotal = pricedLines.reduce((sum, line) => {
        const mod = (line.modifiers || []).reduce((s, m) => s + m.priceAdjustment, 0);
        return sum + (line.unitPrice + mod) * line.quantity;
      }, 0);
      const resolved = await resolveActivePromoByCode(
        serviceSb,
        requestedPromo,
        body.merchantId,
      );
      if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status);
      const promo = resolved.promo;
      if (promo.min_order != null && provisionalSubtotal < Number(promo.min_order)) {
        return c.json({
          error: `Minimum order J$${Number(promo.min_order).toFixed(0)} required for promo`,
        }, 400);
      }
      discount = computePromoDiscount(promo, provisionalSubtotal);
      appliedPromoCode = promo.promo_code;
      await serviceSb
        .from("merchant_promotions")
        .update({ redemptions: Number(promo.redemptions ?? 0) + 1 })
        .eq("id", promo.id);
    }

    const pricing = calculateOrderPricing({
      lines: pricedLines,
      taxRatePercent: 16.5,
      discount,
    });
    // Soft-launch fee engine: merchant commission_rate override → global settings → 5%
    const { data: merchantRow } = await serviceSb
      .from("merchants")
      .select("delivery_fee, commission_rate")
      .eq("id", body.merchantId)
      .maybeSingle();
    const globalRate = await loadDashGlobalPlatformFeeRate(serviceSb);
    const merchantOverride = merchantRow?.commission_rate != null
      ? Number(merchantRow.commission_rate)
      : null;
    const feeRate = resolveDashPlatformFeeRate(merchantOverride, globalRate);
    const platformFee = Math.round(pricing.subtotal * feeRate * 100) / 100;
    const deliveryFee = Math.max(0, Number(merchantRow?.delivery_fee ?? 0));
    const tip = Math.max(0, Number(body.tip) || 0);
    const total = Math.round(
      (pricing.subtotal - discount + platformFee + deliveryFee + pricing.tax + tip) * 100,
    ) / 100;

    // Service role: customers have SELECT-only RLS on orders (no INSERT policy).
    const customerRow = customer as {
      id: string;
      account_status?: string;
      default_lat?: number | null;
      default_lng?: number | null;
    };
    const dropoffLat = asCoord(body.deliveryLat) ?? asCoord(customerRow.default_lat);
    const dropoffLng = asCoord(body.deliveryLng) ?? asCoord(customerRow.default_lng);
    const hasDropoffPin = dropoffLat != null && dropoffLng != null && !(dropoffLat === 0 && dropoffLng === 0);

    async function waitForOrderById(orderId: string) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: existing } = await serviceSb
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .maybeSingle();
        if (existing) return existing;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }

    let idempotencyOrderId: string | null = null;

    if (idempotencyKey) {
      const nowIso = new Date().toISOString();
      const { data: existingMapping, error: lookupError } = await serviceSb
        .from("order_idempotency_keys")
        .select("order_id")
        .eq("customer_id", customer.id)
        .eq("idempotency_key", idempotencyKey)
        .gt("expires_at", nowIso)
        .maybeSingle();

      const lookupInfra = idempotencyInfrastructureError(lookupError);
      if (lookupInfra) {
        return c.json({ error: lookupInfra }, 503);
      }

      if (existingMapping?.order_id) {
        const existingOrder = await waitForOrderById(String(existingMapping.order_id));
        if (existingOrder) return c.json({ order: existingOrder }, 200);
        return c.json({ error: "Order placement is still in progress; please retry." }, 409);
      }

      idempotencyOrderId = crypto.randomUUID();

      const { error: mappingError } = await serviceSb
        .from("order_idempotency_keys")
        .insert({
          customer_id: customer.id,
          idempotency_key: idempotencyKey,
          order_id: idempotencyOrderId,
        })
        .select()
        .single();

      if (mappingError) {
        // Likely a concurrent request won the race and inserted the mapping first.
        const { data: racedMapping } = await serviceSb
          .from("order_idempotency_keys")
          .select("order_id")
          .eq("customer_id", customer.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (racedMapping?.order_id) {
          const existingOrder = await waitForOrderById(String(racedMapping.order_id));
          if (existingOrder) return c.json({ order: existingOrder }, 200);
        }

        const mappingInfra = idempotencyInfrastructureError(mappingError);
        if (mappingInfra) {
          return c.json({ error: mappingInfra }, 503);
        }

        return c.json({ error: mappingError.message }, 500);
      }
    }

    const insertPayload: Record<string, unknown> = {
      customer_id: customer.id,
      merchant_id: body.merchantId,
      items: orderItems,
      subtotal: pricing.subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      tax: pricing.tax,
      tip,
      discount,
      total,
      delivery_address: body.deliveryAddress,
      delivery_address_line2: body.deliveryAddressLine2 ?? body.delivery_address_line2 ?? null,
      delivery_lat: hasDropoffPin ? dropoffLat : null,
      delivery_lng: hasDropoffPin ? dropoffLng : null,
      delivery_instructions: body.deliveryInstructions,
      payment_method: body.paymentMethod || "cash",
      payment_status: (body.paymentMethod || "cash") === "cash" ? "paid" : "pending",
      ...(appliedPromoCode ? { promo_code: appliedPromoCode } : {}),
    };

    if (idempotencyOrderId) {
      // If we get here, our mapping was created; pin the order row to that mapping order_id.
      insertPayload.id = idempotencyOrderId;
    }

    const { data: order, error: orderError } = await serviceSb
      .from("orders")
      .insert(insertPayload)
      .select()
      .single();

    if (orderError) {
      if (idempotencyKey && idempotencyOrderId) {
        await serviceSb.from("order_idempotency_keys").delete().eq("customer_id", customer.id).eq("idempotency_key", idempotencyKey).eq("order_id", idempotencyOrderId);
      }
      return c.json({ error: orderError.message }, 500);
    }

    // Create initial order event
    await serviceSb.from("order_events").insert({
      order_id: order.id,
      status: "placed",
      actor_type: "customer",
      actor_id: user.id,
    });

    return c.json({ order }, 201);
  });

  // Get order details — auth + ownership required (customer or merchant staff)
  app.get("/orders/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id } = c.req.param();
    const serviceSb = getServiceSupabase();

    const { data: order, error } = await serviceSb
      .from("orders")
      .select(`
      *,
      merchant:merchants(id, name, logo_url, phone, address, avg_prep_time_mins),
      ${ORDER_CUSTOMER_EMBED_WITH_USER}
    `)
      .eq("id", id)
      .single();

    if (error || !order) return c.json({ error: "Order not found" }, 404);

    const customerRow = order.customer as { id?: string; user_id?: string } | null;
    const isCustomer = customerRow?.user_id === user.id;
    const isAssignedCourier =
      String((order as { courier_id?: string | null }).courier_id || "") === user.id;

    let isMerchantStaff = false;
    if (!isCustomer && !isAssignedCourier) {
      const merchantAccess = await requireResolvedMerchantWithPermission(
        user.id,
        user.email,
        "orders",
      );
      if (merchantAccess.ok) {
        const merchantId = String(
          (order as { merchant_id?: string }).merchant_id ||
            (order.merchant as { id?: string } | null)?.id ||
            "",
        );
        isMerchantStaff = String(merchantAccess.resolved.merchant.id) === merchantId;
      }
    }

    if (!isCustomer && !isMerchantStaff && !isAssignedCourier) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data: events } = await serviceSb
      .from("order_events")
      .select("*")
      .eq("order_id", id)
      .order("created_at");

    // Merchant/customer-safe courier slice (service-role; RLS blocks direct client reads)
    let courier: {
      display_name: string | null;
      phone: string | null;
      vehicle_type: string | null;
      rating: number | null;
    } | null = null;
    const courierId = (order as { courier_id?: string | null }).courier_id;
    if (courierId) {
      const { data: cp } = await serviceSb
        .from("courier_profiles")
        .select("display_name, phone, vehicle_type, rating")
        .eq("user_id", courierId)
        .maybeSingle();
      if (cp) {
        courier = {
          display_name: (cp.display_name as string | null) ?? null,
          phone: (cp.phone as string | null) ?? null,
          vehicle_type: (cp.vehicle_type as string | null) ?? null,
          rating: cp.rating != null ? Number(cp.rating) : null,
        };
      }
    }

    return c.json({ order: { ...order, courier }, events: events || [] });
  });

  // Customer order history
  app.get("/customer/orders", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!customer) return c.json({ orders: [] });

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
      *,
      merchant:merchants(id, name, logo_url)
    `)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ orders: orders || [] });
  });

  // Customer review on completed order — uses orders.customer_rating / customer_review
  app.post("/orders/:id/review", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const rating = Math.round(Number(body.rating));
    const review = typeof body.review === "string" ? body.review.trim().slice(0, 2000) : "";

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return c.json({ error: "Rating must be 1–5" }, 400);
    }

    const serviceSb = getServiceSupabase();
    const { data: customer } = await serviceSb
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const lookup = ORDER_ID_UUID.test(id)
      ? serviceSb.from("orders").select("id, customer_id, merchant_id, status, customer_rating").eq("id", id)
      : serviceSb.from("orders").select("id, customer_id, merchant_id, status, customer_rating").eq("order_number", id);
    const { data: order, error: orderError } = await lookup.maybeSingle();

    if (orderError || !order) return c.json({ error: "Order not found" }, 404);
    if (order.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);

    const status = String(order.status);
    if (!["delivered", "completed"].includes(status)) {
      return c.json({ error: "Order must be delivered before reviewing" }, 400);
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      customer_rating: rating,
      customer_review: review || null,
      updated_at: now,
    };
    if (status === "delivered") patch.status = "completed";

    const { data: updated, error: updateError } = await serviceSb
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .select("id, status, customer_rating, customer_review")
      .single();

    if (updateError) return c.json({ error: updateError.message }, 500);

    if (status === "delivered") {
      await serviceSb.from("order_events").insert({
        order_id: order.id,
        status: "completed",
        actor_type: "customer",
        actor_id: user.id,
        notes: "Customer submitted rating",
      });
    }

    if (order.merchant_id) {
      const { data: rated } = await serviceSb
        .from("orders")
        .select("customer_rating")
        .eq("merchant_id", order.merchant_id)
        .not("customer_rating", "is", null)
        .eq("review_hidden", false);
      const ratings = (rated ?? [])
        .map((row) => Number((row as { customer_rating: number }).customer_rating))
        .filter((n) => n >= 1 && n <= 5);
      if (ratings.length) {
        const avg = Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10;
        await serviceSb.from("merchants").update({ rating: avg, updated_at: now }).eq("id", order.merchant_id);
      }
    }

    return c.json({ order: updated });
  });

  // Customer self-serve cancel — only placed / accepted (before kitchen prep)
  app.post("/orders/:id/cancel", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : "Cancelled by customer";

    const serviceSb = getServiceSupabase();
    const { data: customer } = await serviceSb
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const { data: order, error: orderError } = await serviceSb
      .from("orders")
      .select("id, customer_id, status, courier_id, payment_status, total")
      .eq("id", id)
      .single();

    if (orderError || !order) return c.json({ error: "Order not found" }, 404);
    if (order.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);

    const status = String(order.status);
    if (!["placed", "accepted"].includes(status)) {
      return c.json(
        {
          error:
            "Orders can only be cancelled before the restaurant starts preparing. Contact support for help.",
        },
        400,
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await serviceSb
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: "customer",
        cancellation_reason: reason,
      })
      .eq("id", id)
      .eq("customer_id", customer.id)
      .in("status", ["placed", "accepted"])
      .select()
      .single();

    if (updateError || !updated) {
      return c.json({ error: updateError?.message ?? "Cancel failed" }, 500);
    }

    await serviceSb.from("order_events").insert({
      order_id: id,
      status: "cancelled",
      actor_type: "customer",
      actor_id: user.id,
      notes: reason,
    });

    if (order.courier_id) {
      await serviceSb
        .from("courier_availability")
        .update({ active_order_id: null })
        .eq("driver_id", order.courier_id);
    }
    await serviceSb
      .from("courier_availability")
      .update({ active_order_id: null })
      .eq("active_order_id", id);

    // Queue refund for paid orders (provider call may be pending if WiPay refund URL unset)
    let refundQueued = false;
    if (String(order.payment_status || "") === "paid") {
      const paymentsSb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { db: { schema: "payments" } },
      );
      const { data: txn } = await paymentsSb
        .from("transactions")
        .select("id, amount, currency")
        .eq("order_id", id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (txn?.id) {
        const { error: refundErr } = await paymentsSb.from("refunds").insert({
          transaction_id: txn.id,
          order_id: id,
          amount: Number(txn.amount),
          currency: txn.currency || "JMD",
          reason,
          status: "pending",
        });
        if (!refundErr) {
          refundQueued = true;
          await serviceSb
            .from("orders")
            .update({ payment_status: "refund_pending" })
            .eq("id", id);
        }
      }
    }

    return c.json({ order: updated, refundQueued });
  });

  const CUSTOMER_ISSUE_TYPES = new Set([
    "missing",
    "wrong",
    "quality",
    "payment",
    "safety",
    "account",
    "other",
  ]);

  // Customer support intake — persists to customer_order_issues (not a fake timeout)
  app.post("/orders/:id/issue", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const issueType = String(body.issueType || body.issue_type || "").trim().toLowerCase();
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
    const photoPath = typeof body.photoPath === "string"
      ? body.photoPath.trim()
      : typeof body.photo_path === "string"
      ? body.photo_path.trim()
      : "";

    if (!CUSTOMER_ISSUE_TYPES.has(issueType)) {
      return c.json({ error: "Invalid issue type" }, 400);
    }
    if (notes.length < 8) {
      return c.json({ error: "Please describe what happened (at least a short sentence)." }, 400);
    }
    if (photoPath && !photoPath.startsWith(`${user.id}/issues/`)) {
      return c.json({ error: "Invalid photo" }, 400);
    }

    const serviceSb = getServiceSupabase();
    const { data: customer } = await serviceSb
      .from("customers")
      .select("id, email, name")
      .eq("user_id", user.id)
      .single();

    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const lookup = ORDER_ID_UUID.test(id)
      ? serviceSb.from("orders").select("id, customer_id, status, order_number").eq("id", id)
      : serviceSb.from("orders").select("id, customer_id, status, order_number").eq("order_number", id);
    const { data: order, error: orderError } = await lookup.maybeSingle();

    if (orderError || !order) return c.json({ error: "Order not found" }, 404);
    if (order.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);

    const { data: issue, error: insertError } = await serviceSb
      .from("customer_order_issues")
      .insert({
        order_id: order.id,
        customer_id: customer.id,
        issue_type: issueType,
        notes,
        photo_url: photoPath || null,
      })
      .select("id, order_id, issue_type, status, created_at")
      .single();

    if (insertError) return c.json({ error: insertError.message }, 500);

    const issueLabels: Record<string, string> = {
      missing: "Missing items",
      wrong: "Wrong items",
      quality: "Food quality",
      payment: "Payment issue",
      safety: "Safety issue",
      account: "Account issue",
      other: "Order issue",
    };
    const orderRef = String(order.order_number || order.id);
    await serviceSb.from("support_cases").insert({
      subject: `${issueLabels[issueType] ?? "Order issue"} — ${orderRef}`,
      body: photoPath ? `${notes}\n\nPhoto attached.` : notes,
      status: "open",
      priority: issueType === "quality" || issueType === "missing" || issueType === "safety" ? "high" : "normal",
      customer_id: customer.id,
      order_id: order.id,
      contact_email: (customer.email as string | null) || user.email || null,
      created_by: user.id,
    });

    await serviceSb.from("order_events").insert({
      order_id: order.id,
      status: "issue_reported",
      actor_type: "customer",
      actor_id: user.id,
      notes: `issue:${issueType}`,
    });

    return c.json({ issue });
  });

  // Customer approve/reject grocery substitute proposal
  app.post("/orders/:id/substitutions/:subId/respond", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id, subId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const approve = Boolean(body.approve ?? body.approved);

    const serviceSb = getServiceSupabase();
    const { data: customer } = await serviceSb
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const { data: order } = await serviceSb
      .from("orders")
      .select("id, customer_id, subtotal, total, items")
      .eq("id", id)
      .maybeSingle();
    if (!order || order.customer_id !== customer.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data: sub } = await serviceSb
      .from("order_item_substitutions")
      .select("*")
      .eq("id", subId)
      .eq("order_id", id)
      .maybeSingle();
    if (!sub || sub.substitution_status !== "pending") {
      return c.json({ error: "Substitution not pending" }, 400);
    }

    if (!approve) {
      const { data: updated } = await serviceSb
        .from("order_item_substitutions")
        .update({ substitution_status: "rejected" })
        .eq("id", subId)
        .select()
        .single();
      return c.json({ substitution: updated });
    }

    const priceDelta = sub.substitute_price != null ? Number(sub.substitute_price) : 0;
    const newSubtotal = Math.round((Number(order.subtotal || 0) + priceDelta) * 100) / 100;
    const newTotal = Math.round((Number(order.total || 0) + priceDelta) * 100) / 100;

    const { data: updated } = await serviceSb
      .from("order_item_substitutions")
      .update({
        substitution_status: "approved",
        approved_at: new Date().toISOString(),
        price_delta: priceDelta,
      })
      .eq("id", subId)
      .select()
      .single();

    await serviceSb
      .from("orders")
      .update({ subtotal: newSubtotal, total: newTotal })
      .eq("id", id);

    await serviceSb.from("order_events").insert({
      order_id: id,
      status: "substitution_approved",
      actor_type: "customer",
      actor_id: user.id,
      notes: sub.substitute_label,
    });

    return c.json({ substitution: updated, subtotal: newSubtotal, total: newTotal });
  });
}
