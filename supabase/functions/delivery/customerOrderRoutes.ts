/**
 * Customer-facing order routes (place, detail, history).
 * Extracted from delivery/index.ts for maintainability — behavior identical.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateOrderPricing } from "../_shared/orderPricing.ts";
import { getFlag } from "../_shared/featureFlags.ts";
import { requireResolvedMerchantWithPermission } from "./merchantAuth.ts";
import { validateBody, z } from "../_shared/validateBody.ts";

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

    // Get or create customer
    let { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!customer) {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          user_id: user.id,
          name: body.customerName || user.email?.split("@")[0] || "Customer",
          phone: body.phone,
          email: user.email,
        })
        .select("id")
        .single();

      if (customerError) return c.json({ error: customerError.message }, 500);
      customer = newCustomer;
    }

    const rawItems = body.items as Array<{ id?: string; menuItemId?: string; quantity?: number; modifiers?: unknown[] }>;

    // Server-side prices from menu_items — never trust client unit prices / discount
    const serviceSb = getServiceSupabase();
    const menuItemIds = [...new Set(rawItems.map((item: { id?: string; menuItemId?: string }) =>
      String(item.menuItemId || item.id || ""),
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
      const menuItemId = String(item.menuItemId || item.id || "");
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

    const pricing = calculateOrderPricing({
      lines: pricedLines,
      taxRatePercent: 16.5,
      discount: 0,
    });
    const platformFee = Math.round(pricing.subtotal * 0.05 * 100) / 100;
    // Do not trust client deliveryFee/discount — tip remains customer-chosen
    const deliveryFee = 0;
    const tip = Math.max(0, Number(body.tip) || 0);
    const total = Math.round((pricing.subtotal + platformFee + deliveryFee + pricing.tax + tip) * 100) / 100;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id: customer.id,
        merchant_id: body.merchantId,
        items: orderItems,
        subtotal: pricing.subtotal,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        tax: pricing.tax,
        tip,
        discount: 0,
        total,
        delivery_address: body.deliveryAddress,
        delivery_lat: body.deliveryLat,
        delivery_lng: body.deliveryLng,
        delivery_instructions: body.deliveryInstructions,
        payment_method: body.paymentMethod || "cash",
      })
      .select()
      .single();

    if (orderError) return c.json({ error: orderError.message }, 500);

    // Create initial order event
    await supabase.from("order_events").insert({
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
      merchant:merchants(id, name, logo_url, phone, address),
      customer:customers(id, name, phone, user_id)
    `)
      .eq("id", id)
      .single();

    if (error || !order) return c.json({ error: "Order not found" }, 404);

    const customerRow = order.customer as { id?: string; user_id?: string } | null;
    const isCustomer = customerRow?.user_id === user.id;

    let isMerchantStaff = false;
    if (!isCustomer) {
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

    if (!isCustomer && !isMerchantStaff) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data: events } = await serviceSb
      .from("order_events")
      .select("*")
      .eq("order_id", id)
      .order("created_at");

    return c.json({ order, events: events || [] });
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
}
