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

const app = new Hono();

// CORS for all routes
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Helper to get Supabase client
function getSupabase(authHeader: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  if (authHeader) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
  }
  return createClient(supabaseUrl, supabaseServiceKey);
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
  const { cuisine, lat, lng, radius } = c.req.query();
  
  let query = supabase
    .from("merchants")
    .select("*")
    .eq("is_active", true)
    .eq("is_accepting_orders", true);
  
  if (cuisine) {
    query = query.eq("cuisine_type", cuisine);
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
    .eq("is_available", true);
  
  return c.json({
    merchant,
    categories: categories || [],
    items: items || [],
  });
});

// Register new merchant (authenticated)
app.post("/merchants", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  const slug = body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  
  const { data, error } = await supabase
    .from("merchants")
    .insert({
      owner_id: user.id,
      name: body.name,
      slug: slug + "-" + Date.now().toString(36),
      description: body.description,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      phone: body.phone,
      email: body.email,
      cuisine_type: body.cuisineType,
    })
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ merchant: data }, 201);
});

// Update merchant (owner only)
app.put("/merchants/:id", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { id } = c.req.param();
  const body = await c.req.json();
  
  const { data, error } = await supabase
    .from("merchants")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ merchant: data });
});

// Get current user's merchant profile
app.get("/merchant/profile", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("owner_id", user.id)
    .single();
  
  if (error && error.code !== "PGRST116") {
    return c.json({ error: error.message }, 500);
  }
  
  if (!merchant) {
    return c.json({ error: "No merchant found" }, 404);
  }
  
  return c.json({ merchant });
});

// ============================================================================
// Menu Management
// ============================================================================

// Add menu category
app.post("/merchants/:merchantId/categories", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { merchantId } = c.req.param();
  const body = await c.req.json();
  
  const { data, error } = await supabase
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

// Add menu item
app.post("/merchants/:merchantId/items", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { merchantId } = c.req.param();
  const body = await c.req.json();
  
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      merchant_id: merchantId,
      category_id: body.categoryId,
      name: body.name,
      description: body.description,
      price: body.price,
      image_url: body.imageUrl,
      prep_time_mins: body.prepTimeMins,
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
  
  const supabase = getSupabase(authHeader);
  const { itemId } = c.req.param();
  const body = await c.req.json();
  
  const { data, error } = await supabase
    .from("menu_items")
    .update(body)
    .eq("id", itemId)
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ item: data });
});

// Delete menu item
app.delete("/merchants/:merchantId/items/:itemId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { itemId } = c.req.param();
  
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", itemId);
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
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
  const { status, notes, actorType } = body;
  
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
  
  // Get merchant owned by this user
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  
  if (!merchant) return c.json({ error: "Not a merchant" }, 403);
  
  const { status } = c.req.query();
  
  let query = supabase
    .from("orders")
    .select(`
      *,
      customer:customers(id, name, phone)
    `)
    .eq("merchant_id", merchant.id);
  
  if (status) {
    query = query.eq("status", status);
  } else {
    // Default: show active orders
    query = query.in("status", ["placed", "accepted", "preparing", "ready"]);
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

Deno.serve(app.fetch);
