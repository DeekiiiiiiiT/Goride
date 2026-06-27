import type { Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateOrderPricing } from "../_shared/orderPricing.ts";
import type { ResolvedMerchantAccess } from "./merchantAuth.ts";
import { requireResolvedMerchantWithPermission } from "./merchantAuth.ts";
import {
  depleteForPosSale,
  merchantUsesEnterpriseInventory,
  resolveNodeIdForMerchant,
} from "./inventory/depletionService.ts";

const IN_STORE_CAPABILITY = "in_store_operations";

function getServiceDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function merchantCapabilities(merchant: Record<string, unknown>): string[] {
  const caps = merchant.capabilities;
  if (Array.isArray(caps) && caps.length > 0) return caps.map(String);
  return ["roam_delivery"];
}

function hasInStoreCapability(merchant: Record<string, unknown>): boolean {
  return merchantCapabilities(merchant).includes(IN_STORE_CAPABILITY);
}

function requireOwner(access: ResolvedMerchantAccess) {
  if (!access.membership.is_owner) {
    return { ok: false as const, status: 403, message: "Owner only" };
  }
  return { ok: true as const };
}

async function resolveOwnerAccess(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return { ok: false as const, status: 401, message: "Unauthorized" };

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { ok: false as const, status: 401, message: "Unauthorized" };

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
  if (!access.ok) return { ok: false as const, status: access.status, message: access.message };

  return { ok: true as const, user, access: access.resolved };
}

function nextOrderNumber() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}

function receiptPayload(order: Record<string, unknown>, merchant: Record<string, unknown>) {
  return {
    merchantName: merchant.name,
    orderNumber: order.order_number,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    paymentMethod: order.payment_method,
    printedAt: new Date().toISOString(),
    footer: merchant.pos_receipt_footer ?? null,
  };
}

async function processOrderInventoryDepletion(
  sb: SupabaseClient,
  merchant: Record<string, unknown>,
  merchantId: string,
  orderId: string,
  items: Array<{ menuItemId?: string; name: string; quantity: number }>,
  _memberId?: string | null,
) {
  if (!merchantUsesEnterpriseInventory(merchant)) return;

  const nodeId = await resolveNodeIdForMerchant(sb, merchantId);
  if (!nodeId) throw new Error("No inventory node linked to this store");

  await depleteForPosSale(sb, {
    nodeId,
    orderId,
    items: items.filter((i): i is { menuItemId: string; name: string; quantity: number } =>
      Boolean(i.menuItemId)
    ),
    idempotencyPrefix: `order:${orderId}`,
  });
}

// Legacy BOM inventory routes removed — use /merchant/enterprise-inventory/*
export function registerMerchantRestaurantRoutes(app: {
  post: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  get: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  put: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  patch: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  delete: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
}) {
  app.post("/merchant/capabilities/enable", async (c) => {
    return c.json(
      { error: "Restaurant Management must be enabled by a Roam admin in the partner portal" },
      403,
    );
  });

  app.get("/merchant/restaurant/settings", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const m = resolved.access.merchant;
    return c.json({
      settings: {
        capabilities: merchantCapabilities(m),
        taxRatePercent: Number(m.pos_tax_rate_percent ?? 0),
        printerId: m.pos_printer_id ?? null,
        receiptFooter: m.pos_receipt_footer ?? "",
        showInStoreOnCounter: Boolean(m.pos_show_in_store_on_counter),
        showInStoreOnKitchen: Boolean(m.pos_show_in_store_on_kitchen),
      },
    });
  });

  app.patch("/merchant/restaurant/settings", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);

    const ownerCheck = requireOwner(resolved.access);
    if (!ownerCheck.ok) return c.json({ error: ownerCheck.message }, ownerCheck.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const body = await c.req.json();
    const patch: Record<string, unknown> = {};
    if (body.taxRatePercent != null) patch.pos_tax_rate_percent = body.taxRatePercent;
    if (body.printerId != null) patch.pos_printer_id = body.printerId;
    if (body.receiptFooter != null) patch.pos_receipt_footer = body.receiptFooter;
    if (body.showInStoreOnCounter != null) patch.pos_show_in_store_on_counter = body.showInStoreOnCounter;
    if (body.showInStoreOnKitchen != null) patch.pos_show_in_store_on_kitchen = body.showInStoreOnKitchen;

    const sb = getServiceDb();
    const { data, error } = await sb
      .from("merchants")
      .update(patch)
      .eq("id", resolved.access.merchant.id)
      .select("id, pos_tax_rate_percent, pos_printer_id, pos_receipt_footer, pos_show_in_store_on_counter, pos_show_in_store_on_kitchen")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data });
  });

  app.post("/merchant/pos/orders", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const body = await c.req.json();
    const merchant = resolved.access.merchant;
    const merchantId = String(merchant.id);
    const taxRatePercent = Number(merchant.pos_tax_rate_percent ?? 0);

    const pricing = calculateOrderPricing({
      lines: (body.lines ?? []).map((line: Record<string, unknown>) => ({
        menuItemId: String(line.menuItemId),
        name: String(line.name),
        unitPrice: Number(line.unitPrice),
        quantity: Number(line.quantity),
        modifiers: line.modifiers as Array<{ name: string; priceAdjustment: number }> | undefined,
      })),
      taxRatePercent,
      discount: Number(body.discount ?? 0),
    });

    const sb = getServiceDb();
    const status = body.markPaid ? "paid" : "draft";
    const paymentStatus = body.markPaid ? "paid" : "pending";

    const { data: order, error } = await sb
      .from("orders")
      .insert({
        order_number: nextOrderNumber(),
        merchant_id: merchantId,
        customer_id: null,
        channel: "in_store",
        fulfillment_type: body.fulfillmentType ?? "counter",
        status,
        payment_status: paymentStatus,
        payment_method: body.paymentMethod ?? null,
        items: pricing.lineItems,
        subtotal: pricing.subtotal,
        delivery_fee: 0,
        platform_fee: 0,
        tax: pricing.tax,
        tip: 0,
        discount: pricing.discount,
        total: pricing.total,
        delivery_address: "In-store",
        placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    await sb.from("order_fulfillment").insert({
      order_id: order.id,
      table_label: body.tableLabel ?? null,
      guest_name: body.guestName ?? null,
      guest_phone: body.guestPhone ?? null,
      cashier_member_id: body.cashierMemberId ?? null,
    });

    if (body.markPaid) {
      try {
        await processOrderInventoryDepletion(
          sb,
          merchant,
          merchantId,
          String(order.id),
          (body.lines ?? []) as Array<{ menuItemId?: string; name: string; quantity: number }>,
          body.cashierMemberId ?? null,
        );
      } catch (stockError) {
        await sb.from("orders").delete().eq("id", order.id);
        return c.json({ error: String(stockError) }, 409);
      }

      if (merchant.pos_printer_id) {
        await sb.from("print_jobs").insert({
          merchant_id: merchantId,
          order_id: order.id,
          job_type: "customer_receipt",
          payload: receiptPayload(order as Record<string, unknown>, merchant),
          status: "queued",
          printer_id: merchant.pos_printer_id,
        });
      }
    }

    return c.json({ order });
  });

  app.post("/merchant/pos/orders/:id/payment-intent", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const { id } = c.req.param();
    const sb = getServiceDb();
    const merchantId = String(resolved.access.merchant.id);

    const { data: order, error: fetchError } = await sb
      .from("orders")
      .select("id, total, payment_status, channel")
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .eq("channel", "in_store")
      .single();

    if (fetchError) return c.json({ error: fetchError.message }, 404);
    if ((order as Record<string, unknown>).payment_status === "paid") {
      return c.json({ error: "Order already paid" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return c.json({
        orderId: id,
        clientSecret: null,
        mockMode: true,
        message: "Stripe not configured — complete sale to mark paid locally",
      });
    }

    try {
      const amountCents = Math.round(Number((order as Record<string, unknown>).total) * 100);
      const params = new URLSearchParams({
        amount: String(amountCents),
        currency: "jmd",
        "payment_method_types[]": "card_present",
        capture_method: "automatic",
        "metadata[order_id]": id,
        "metadata[merchant_id]": merchantId,
      });
      const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const pi = await piRes.json();
      if (!piRes.ok) {
        return c.json({ error: pi.error?.message ?? "Payment intent failed" }, 502);
      }

      await sb.from("order_fulfillment").update({
        payment_intent_id: pi.id,
      }).eq("order_id", id);

      return c.json({
        orderId: id,
        clientSecret: pi.client_secret,
        mockMode: false,
      });
    } catch (error) {
      return c.json({ error: String(error) }, 500);
    }
  });

  app.post("/merchant/pos/orders/:id/pay", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const { id } = c.req.param();
    const body = await c.req.json();
    const sb = getServiceDb();
    const merchant = resolved.access.merchant;
    const merchantId = String(merchant.id);

    const { data: order, error: fetchError } = await sb
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .eq("channel", "in_store")
      .single();

    if (fetchError) return c.json({ error: fetchError.message }, 404);

    const { data: updated, error } = await sb
      .from("orders")
      .update({
        status: "paid",
        payment_status: "paid",
        payment_method: body.paymentMethod ?? "card",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    const items = (order as Record<string, unknown>).items as Array<{
      menuItemId?: string;
      name: string;
      quantity: number;
    }>;

    try {
      await processOrderInventoryDepletion(sb, merchant, merchantId, id, items, body.cashierMemberId ?? null);
    } catch (stockError) {
      return c.json({ error: String(stockError) }, 409);
    }

    if (merchant.pos_printer_id) {
      await sb.from("print_jobs").insert({
        merchant_id: merchantId,
        order_id: id,
        job_type: "customer_receipt",
        payload: receiptPayload(updated as Record<string, unknown>, merchant),
        status: "queued",
        printer_id: merchant.pos_printer_id,
      });
    }

    return c.json({ order: updated });
  });

  app.get("/merchant/print-jobs", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const sb = getServiceDb();
    const { data, error } = await sb
      .from("print_jobs")
      .select("*")
      .eq("merchant_id", resolved.access.merchant.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ printJobs: data ?? [] });
  });

  app.post("/merchant/print-jobs/test", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const merchant = resolved.access.merchant;
    const sb = getServiceDb();
    const printerId = merchant.pos_printer_id ?? "default";

    const { data, error } = await sb
      .from("print_jobs")
      .insert({
        merchant_id: merchant.id,
        job_type: "customer_receipt",
        payload: {
          merchantName: merchant.name,
          orderNumber: "TEST",
          total: 0,
          items: [],
          printedAt: new Date().toISOString(),
          footer: merchant.pos_receipt_footer ?? "Test print",
        },
        status: "queued",
        printer_id: printerId,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ printJob: data });
  });

  app.get("/merchant/reports/in-store-sales", async (c) => {
    const resolved = await resolveOwnerAccess(c);
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status);
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return c.json({ error: "Restaurant management not enabled" }, 403);
    }

    const range = c.req.query("range") ?? "today";
    const sb = getServiceDb();
    const merchantId = String(resolved.access.merchant.id);

    const start = new Date();
    if (range === "week") start.setDate(start.getDate() - 7);
    else start.setHours(0, 0, 0, 0);

    const { data: orders, error } = await sb
      .from("orders")
      .select("total, placed_at")
      .eq("merchant_id", merchantId)
      .eq("channel", "in_store")
      .eq("payment_status", "paid")
      .gte("placed_at", start.toISOString());

    if (error) return c.json({ error: error.message }, 500);

    const rows = orders ?? [];
    const total = rows.reduce((sum, row) => sum + Number((row as Record<string, unknown>).total), 0);
    const count = rows.length;
    const avgTicket = count > 0 ? total / count : 0;

    return c.json({
      range,
      total,
      orderCount: count,
      avgTicket,
    });
  });
}

export function inStoreStatusTransitions(): Record<string, string[]> {
  return {
    draft: ["paid", "cancelled"],
    paid: ["preparing", "cancelled"],
    preparing: ["ready"],
    ready: ["completed"],
    completed: [],
    cancelled: [],
  };
}

export function roamStatusTransitions(): Record<string, string[]> {
  return {
    placed: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready"],
    ready: ["picked_up", "cancelled"],
    picked_up: ["in_transit"],
    in_transit: ["delivered"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
  };
}
