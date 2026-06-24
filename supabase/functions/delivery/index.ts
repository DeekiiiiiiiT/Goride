/**
 * Roam Dash - Delivery Service
 * 
 * Handles all delivery/food ordering operations:
 * - Merchant management
 * - Menu management
 * - Order lifecycle
 * - Courier assignment
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtPrimaryRole } from "../_shared/authEdge.ts";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { resolveMerchantAccess, requireResolvedMerchantWithPermission, requireMerchantPermission, type TeamPermission } from "./merchantAuth.ts";
import {
  registerMerchantTeamRoutes,
  getPendingTeamInviteForProfile,
} from "./merchantTeam.ts";

const app = new Hono().basePath("/delivery");

// CORS for all routes
// Fleet admin + dash apps send `apikey` (Supabase anon key) alongside Authorization.
// If it is not listed here, browsers block the request with a CORS error after preflight.
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "apikey",
    "x-client-info",
    "accept-profile",
    "prefer",
  ],
}));

// Helper to get Supabase client (defaults to delivery schema for table queries)
function getSupabase(authHeader: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  if (authHeader) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "delivery" },
    });
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
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

// Auth-only client (uses default public schema so supabase.auth.getUser works)
function getAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ============================================================================
// Health Check
// ============================================================================
app.get("/health", (c) => c.json({ service: "delivery", status: "ok", timestamp: new Date().toISOString() }));

// ============================================================================
// Merchants
// ============================================================================

// List active merchants (public)
app.get("/merchants", async (c) => {
  const supabase = getSupabase(null);
  const { cuisine, lat, lng, radius, vertical } = c.req.query();
  
  let query = supabase
    .from("merchants")
    .select("*")
    .eq("onboarding_status", "submitted")
    .eq("is_active", true)
    .eq("is_accepting_orders", true);
  
  if (cuisine) {
    query = query.eq("cuisine_type", cuisine);
  }
  if (vertical) {
    query = query.eq("vertical_type", vertical);
  }
  
  const { data, error } = await query.order("rating", { ascending: false });
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ merchants: data });
});

// Get merchant details with menu
app.get("/merchants/:id", async (c) => {
  const supabase = getSupabase(null);
  const { id } = c.req.param();
  
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", id)
    .single();
  
  if (merchantError) return c.json({ error: merchantError.message }, 404);

  const m = merchant as Record<string, unknown>;
  if (m.onboarding_status === "draft" || !m.is_active) {
    return c.json({ error: "Merchant not found" }, 404);
  }
  
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("merchant_id", id)
    .eq("is_active", true)
    .order("sort_order");
  
  const { data: items } = await supabase
    .from("menu_items")
    .select("*")
    .eq("merchant_id", id)
    .eq("is_available", true)
    .order("sort_order");
  
  return c.json({
    merchant,
    categories: categories || [],
    items: items || [],
  });
});

// Get current user's merchant profile
app.get("/merchant/profile", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

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
        membership: { role: "admin", permissions: ["orders", "menu", "analytics", "payouts"], is_owner: true },
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
  const supabase = getSupabase(null);
  const { id } = c.req.param();
  
  const { data: hours, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", id)
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
  
  const { data, error } = await serviceSb
    .from("menu_items")
    .insert({
      merchant_id: merchantId,
      category_id: body.categoryId,
      name: body.name,
      description: body.description,
      price: body.price,
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
  
  const { data, error } = await serviceSb
    .from("menu_items")
    .update(body)
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
// Orders
// ============================================================================

// Place new order
app.post("/orders", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
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
  
  // Calculate totals
  const subtotal = body.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  const platformFee = subtotal * 0.05; // 5% platform fee
  const deliveryFee = body.deliveryFee || 0;
  const tax = subtotal * 0.165; // 16.5% GCT for Jamaica
  const total = subtotal + platformFee + deliveryFee + tax + (body.tip || 0) - (body.discount || 0);
  
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      merchant_id: body.merchantId,
      items: body.items,
      subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      tax,
      tip: body.tip || 0,
      discount: body.discount || 0,
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

// Get order details
app.get("/orders/:id", async (c) => {
  const authHeader = c.req.header("Authorization");
  const supabase = getSupabase(authHeader);
  const { id } = c.req.param();
  
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      *,
      merchant:merchants(id, name, logo_url, phone, address),
      customer:customers(id, name, phone)
    `)
    .eq("id", id)
    .single();
  
  if (error) return c.json({ error: error.message }, 404);
  
  const { data: events } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", id)
    .order("created_at");
  
  return c.json({ order, events: events || [] });
});

// Update order status
app.put("/orders/:id/status", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const { id } = c.req.param();
  const body = await c.req.json();
  const { status, notes, actorType, estimatedPrepTimeMins } = body;

  if (actorType === "merchant") {
    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);
  }
  
  // Valid status transitions
  const validTransitions: Record<string, string[]> = {
    placed: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready"],
    ready: ["picked_up", "cancelled"],
    picked_up: ["in_transit"],
    in_transit: ["delivered"],
    delivered: ["completed"],
  };
  
  // Get current order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .single();
  
  if (orderError) return c.json({ error: orderError.message }, 404);
  
  // Validate transition
  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(status)) {
    return c.json({ error: `Invalid status transition from ${order.status} to ${status}` }, 400);
  }
  
  // Update order
  const updateData: Record<string, any> = { status };
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
  
  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  
  if (updateError) return c.json({ error: updateError.message }, 500);
  
  // Log event
  await supabase.from("order_events").insert({
    order_id: id,
    status,
    actor_type: actorType,
    actor_id: user.id,
    notes,
  });
  
  return c.json({ order: updatedOrder });
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

// Merchant incoming orders
app.get("/merchant/orders", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
  if (!access.ok) return c.json({ error: access.message }, access.status);

  const merchantId = access.resolved.merchant.id as string;
  const { status, from, to, limit } = c.req.query();
  
  let query = supabase
    .from("orders")
    .select(`
      *,
      customer:customers(id, name, phone)
    `)
    .eq("merchant_id", merchantId);
  
  if (status) {
    query = query.eq("status", status);
  } else {
    // Default: show active orders
    query = query.in("status", ["placed", "accepted", "preparing", "ready"]);
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
  
  const { data: orders, error } = await query.order("created_at", { ascending: true });
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ orders: orders || [] });
});

// Available orders for couriers
app.get("/courier/available-orders", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      *,
      merchant:merchants(id, name, address, lat, lng)
    `)
    .eq("status", "ready")
    .is("courier_id", null)
    .order("ready_at", { ascending: true });
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ orders: orders || [] });
});

// Courier accepts order
app.post("/orders/:id/accept-delivery", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const { id } = c.req.param();
  
  // Assign courier to order
  const { data: order, error } = await supabase
    .from("orders")
    .update({
      courier_id: user.id,
      status: "picked_up",
      picked_up_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "ready")
    .is("courier_id", null)
    .select()
    .single();
  
  if (error) return c.json({ error: "Order not available" }, 400);
  
  // Log event
  await supabase.from("order_events").insert({
    order_id: id,
    status: "picked_up",
    actor_type: "courier",
    actor_id: user.id,
  });
  
  return c.json({ order });
});

// ============================================================================
// Merchant analytics
// ============================================================================

type OrderRow = Record<string, unknown>;

function parseOrderItems(items: unknown): { name: string; quantity: number; price?: number }[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: String(row.name || "Unknown"),
      quantity: Number(row.quantity || 1),
      price: row.price != null ? Number(row.price) : undefined,
    };
  });
}

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

  const now = new Date();
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toDate = to ? new Date(to) : new Date(now);
  if (!to) {
    toDate.setHours(23, 59, 59, 999);
  }

  const serviceSb = getServiceSupabase();
  const { data: orders, error } = await serviceSb
    .from("orders")
    .select("*")
    .eq("merchant_id", merchantId)
    .gte("placed_at", fromDate.toISOString())
    .lte("placed_at", toDate.toISOString());

  if (error) return c.json({ error: error.message }, 500);

  const allOrders = (orders || []) as OrderRow[];
  const delivered = allOrders.filter((o) => o.status === "delivered");
  const cancelled = allOrders.filter((o) => o.status === "cancelled");
  const active = allOrders.filter((o) =>
    ["placed", "accepted", "preparing", "ready"].includes(String(o.status))
  );

  const totalRevenue = delivered.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
  const totalOrders = delivered.length;
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
  for (const o of delivered) {
    const placed = new Date(String(o.placed_at || o.created_at));
    const key = bucketKey(placed, granularity);
    revenueBuckets[key] = (revenueBuckets[key] || 0) + Number(o.subtotal || 0);
    volumeBuckets[key] = (volumeBuckets[key] || 0) + 1;
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
  const subtotal = Number(order.subtotal || 0);
  const platformFee = Number(order.platform_fee || 0);
  const tip = Number(order.tip || 0);
  const discount = Number(order.discount || 0);
  return subtotal - platformFee + tip - discount;
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
  const commissionRate = Number(merchant.commission_rate ?? 0.15);
  const platformFeePercent = Math.round(commissionRate * 100);

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
  const commissionRate = Number(merchant.commission_rate ?? 0.15);
  const platformFeePercent = Math.round(commissionRate * 100);

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

  if (body.status != null) updates.status = body.status;
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
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: c.req.header("User-Agent") || null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
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
import { registerPartnerBusinessTypeRoutes } from "./admin/onboardingConfigRoutes.ts";
import { registerCourierAdminRoutes } from "./admin/courierRoutes.ts";
import { registerMerchantAdminRoutes } from "./admin/merchantRoutes.ts";
import { registerOrderAdminRoutes } from "./admin/orderRoutes.ts";
import { registerCustomerAdminRoutes } from "./admin/customerRoutes.ts";
import { registerFinanceAdminRoutes } from "./admin/financeRoutes.ts";
registerMerchantApplicationRoutes(app);
registerMerchantTeamRoutes(app, { getSupabase, getServiceSupabase });
registerPartnerBusinessTypeRoutes(app);
registerMerchantAdminRoutes(app);
registerOrderAdminRoutes(app);
registerCustomerAdminRoutes(app);
registerFinanceAdminRoutes(app);
registerCourierAdminRoutes(app);

Deno.serve(app.fetch);
