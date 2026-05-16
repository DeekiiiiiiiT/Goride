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

// Auth-only client (uses default public schema so supabase.auth.getUser works)
function getAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ============================================================================
// Admin role guard (platform_owner / superadmin / platform_support)
// ----------------------------------------------------------------------------
// Mirrors the role-check pattern from
// apps/fleet/src/supabase/functions/server/pending_vehicle_catalog_routes.ts:
// reads the caller's role from auth metadata and rejects non-admins.
// ============================================================================

const ADMIN_ROLES = new Set([
  "platform_owner",
  "superadmin",
  "platform_support",
  // Legacy fleet aliases that resolve to platform_owner via resolveRole()
  "admin",
]);

type AdminUser = { id: string; email: string; role: string };

async function requireAdmin(c: any): Promise<AdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }
  const auth = getAuthClient(authHeader);
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }
  const rawRole = jwtPrimaryRole(user);
  if (!ADMIN_ROLES.has(rawRole)) {
    return c.json({
      error: "Forbidden",
      message: "Platform admin role required",
      currentRole: rawRole || "(none)",
    }, 403);
  }
  return { id: user.id, email: user.email || "", role: rawRole };
}

// ============================================================================
// Status transition rules for merchant verification
// ============================================================================

type VerificationStatus =
  | "pending"
  | "in_review"
  | "docs_requested"
  | "approved"
  | "rejected";

const ALLOWED_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  pending: ["in_review", "approved", "rejected"],
  in_review: ["approved", "rejected", "docs_requested"],
  docs_requested: ["in_review", "approved", "rejected"],
  approved: [], // Phase 2: add "suspended"
  rejected: ["pending"], // merchant resubmit
};

function isValidStatus(s: unknown): s is VerificationStatus {
  return typeof s === "string" && s in ALLOWED_TRANSITIONS;
}

// ============================================================================
// Email helper (no-op if SMTP env vars unset)
// Real implementation lives in Phase 1.5 - this is a stub that the status
// handler will call. Logs to console for now, sends real SMTP later.
// ============================================================================

async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const host = Deno.env.get("SMTP_HOST");
  const port = Deno.env.get("SMTP_PORT");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const from = Deno.env.get("SMTP_FROM") || user;

  if (!host || !port || !user || !pass || !from) {
    console.log(
      `[email] SMTP not configured - skipping send to ${opts.to}: "${opts.subject}"`,
    );
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(port),
        tls: true,
        auth: { username: user, password: pass },
      },
    });
    await client.send({
      from,
      to: opts.to,
      subject: opts.subject,
      content: opts.text,
      html: opts.html,
    });
    await client.close();
    return { sent: true };
  } catch (e) {
    console.error(`[email] Failed to send to ${opts.to}:`, e);
    return { sent: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

function renderStatusEmail(
  status: VerificationStatus,
  merchant: { name: string; rejection_reason?: string | null; verification_notes?: string | null },
): { subject: string; html: string; text: string } {
  const portalUrl = "https://partner.roamdash.co";
  switch (status) {
    case "approved":
      return {
        subject: `${merchant.name} is now live on Roam Dash!`,
        text:
          `Great news! Your restaurant "${merchant.name}" has been approved and is now visible to customers on Roam Dash.\n\n` +
          `Log in to your partner portal to start managing orders: ${portalUrl}\n\n` +
          `- The Roam Dash team`,
        html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;padding:24px;">
  <h1 style="color:#10b981;">You're live on Roam Dash!</h1>
  <p>Great news! <strong>${merchant.name}</strong> has been approved and is now visible to customers.</p>
  <p>Log in to your partner portal to start managing orders.</p>
  <p><a href="${portalUrl}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Open Partner Portal</a></p>
  <p style="color:#64748b;font-size:14px;margin-top:24px;">- The Roam Dash team</p>
</div>`,
      };
    case "rejected":
      return {
        subject: `Update on your Roam Dash application`,
        text:
          `Hi from Roam Dash,\n\n` +
          `Unfortunately we were unable to approve "${merchant.name}" at this time.\n\n` +
          `Reason: ${merchant.rejection_reason || "Not specified"}\n\n` +
          `You can edit your application and resubmit at any time: ${portalUrl}\n\n` +
          `- The Roam Dash team`,
        html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;padding:24px;">
  <h1 style="color:#dc2626;">Application update</h1>
  <p>Unfortunately we were unable to approve <strong>${merchant.name}</strong> at this time.</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0;">
    <p style="margin:0;"><strong>Reason:</strong> ${merchant.rejection_reason || "Not specified"}</p>
  </div>
  <p>You can edit your application and resubmit at any time.</p>
  <p><a href="${portalUrl}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Edit & Resubmit</a></p>
  <p style="color:#64748b;font-size:14px;margin-top:24px;">- The Roam Dash team</p>
</div>`,
      };
    case "docs_requested":
      return {
        subject: `Additional information needed for ${merchant.name}`,
        text:
          `Hi from Roam Dash,\n\n` +
          `Our team needs a bit more info before we can approve "${merchant.name}".\n\n` +
          `Note from reviewer: ${merchant.verification_notes || "Please log in to see details"}\n\n` +
          `Log in to your portal to update your application: ${portalUrl}\n\n` +
          `- The Roam Dash team`,
        html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;padding:24px;">
  <h1 style="color:#f59e0b;">More info needed</h1>
  <p>Our team needs a bit more info before we can approve <strong>${merchant.name}</strong>.</p>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;">
    <p style="margin:0;"><strong>Note from reviewer:</strong> ${merchant.verification_notes || "Please log in to see details"}</p>
  </div>
  <p><a href="${portalUrl}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Open Partner Portal</a></p>
  <p style="color:#64748b;font-size:14px;margin-top:24px;">- The Roam Dash team</p>
</div>`,
      };
    case "in_review":
      return {
        subject: `Your Roam Dash application is being reviewed`,
        text:
          `Hi from Roam Dash,\n\n` +
          `A reviewer has started looking at your application for "${merchant.name}".\n` +
          `We will be in touch soon - typically within 24-48 hours.\n\n` +
          `- The Roam Dash team`,
        html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;padding:24px;">
  <h1 style="color:#2563eb;">Under review</h1>
  <p>A reviewer has started looking at your application for <strong>${merchant.name}</strong>.</p>
  <p>We will be in touch soon - typically within 24-48 hours.</p>
  <p style="color:#64748b;font-size:14px;margin-top:24px;">- The Roam Dash team</p>
</div>`,
      };
    default:
      return {
        subject: `Update on ${merchant.name}`,
        text: `Status updated to: ${status}`,
        html: `<p>Status updated to: <strong>${status}</strong></p>`,
      };
  }
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
      logo_url: body.logoUrl,
      cover_image_url: body.coverImageUrl,
      delivery_radius_km: body.deliveryRadiusKm || 10,
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
  const body = await c.req.json();
  const { hours } = body;
  
  if (!Array.isArray(hours)) {
    return c.json({ error: "Hours must be an array" }, 400);
  }
  
  // Delete existing hours for this merchant
  await supabase
    .from("merchant_hours")
    .delete()
    .eq("merchant_id", id);
  
  // Insert new hours
  const hoursData = hours.map((h: any) => ({
    merchant_id: id,
    day_of_week: h.dayOfWeek,
    open_time: h.openTime,
    close_time: h.closeTime,
    is_closed: h.isClosed || false,
  }));
  
  const { data, error } = await supabase
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

// Update menu category
app.put("/merchants/:merchantId/categories/:categoryId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { categoryId } = c.req.param();
  const body = await c.req.json();
  
  const { data, error } = await supabase
    .from("menu_categories")
    .update({
      name: body.name,
      description: body.description,
      sort_order: body.sortOrder,
    })
    .eq("id", categoryId)
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ category: data });
});

// Delete menu category
app.delete("/merchants/:merchantId/categories/:categoryId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { merchantId, categoryId } = c.req.param();
  
  // Move items in this category to uncategorized (null)
  await supabase
    .from("menu_items")
    .update({ category_id: null })
    .eq("category_id", categoryId);
  
  const { error } = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", categoryId);
  
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
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

// ============================================================================
// ADMIN: Merchant Verification Queue
// ----------------------------------------------------------------------------
// All routes here require platform_owner / superadmin / platform_support role.
// Mounted at /delivery/admin/merchants/* (basePath adds /delivery).
// ============================================================================

// Counts of merchants grouped by verification_status
app.get("/admin/merchants/stats", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("merchants")
    .select("verification_status");
  if (error) return c.json({ error: error.message }, 500);
  const counts: Record<string, number> = {
    pending: 0,
    in_review: 0,
    docs_requested: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of data || []) {
    const s = (row as Record<string, unknown>).verification_status as string;
    if (s && s in counts) counts[s]++;
  }
  const total = (data || []).length;
  return c.json({ counts, total });
});

// List merchants with filter, search, pagination
app.get("/admin/merchants", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;

  const sb = getServiceSupabase();
  const { status, search } = c.req.query();
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 200);
  const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
  const offset = (page - 1) * limit;

  let query = sb
    .from("merchants")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false });

  if (status && status !== "all" && isValidStatus(status)) {
    query = query.eq("verification_status", status);
  }

  if (search && search.trim()) {
    const pattern = `%${search.trim()}%`;
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},address.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return c.json({ error: error.message }, 500);

  // Compute counts for tab badges
  const { data: allStatuses } = await sb
    .from("merchants")
    .select("verification_status");
  const counts: Record<string, number> = {
    pending: 0,
    in_review: 0,
    docs_requested: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of allStatuses || []) {
    const s = (row as Record<string, unknown>).verification_status as string;
    if (s && s in counts) counts[s]++;
  }

  return c.json({
    merchants: data || [],
    total: count ?? 0,
    page,
    limit,
    counts,
  });
});

// Get single merchant with hours, owner email, and audit history
app.get("/admin/merchants/:id", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;
  const { id } = c.req.param();

  const sb = getServiceSupabase();
  const { data: merchant, error } = await sb
    .from("merchants")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !merchant) {
    return c.json({ error: error?.message || "Merchant not found" }, 404);
  }

  const { data: hours } = await sb
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", id)
    .order("day_of_week");

  const { data: auditLog } = await sb
    .from("merchant_audit_log")
    .select("*")
    .eq("merchant_id", id)
    .order("created_at", { ascending: false });

  // Look up owner email via auth.users (service-role client can read this)
  let ownerEmail = "";
  try {
    const adminSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ownerId = (merchant as Record<string, unknown>).owner_id as string;
    if (ownerId) {
      const { data: ownerData } = await adminSb.auth.admin.getUserById(ownerId);
      ownerEmail = ownerData?.user?.email || "";
    }
  } catch (e) {
    console.error("[admin] Failed to fetch owner email:", e);
  }

  return c.json({
    merchant,
    hours: hours || [],
    auditLog: auditLog || [],
    ownerEmail,
  });
});

// Change verification status (the main admin action)
app.post("/admin/merchants/:id/status", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const { status: newStatus, notes, internal_notes } = body as {
    status?: string;
    notes?: string;
    internal_notes?: string;
  };

  if (!isValidStatus(newStatus)) {
    return c.json({
      error: "Invalid status",
      allowed: Object.keys(ALLOWED_TRANSITIONS),
    }, 400);
  }

  const sb = getServiceSupabase();
  const { data: current, error: fetchErr } = await sb
    .from("merchants")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !current) {
    return c.json({ error: "Merchant not found" }, 404);
  }

  const fromStatus = (current as Record<string, unknown>).verification_status as VerificationStatus;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (fromStatus !== newStatus && !allowed.includes(newStatus)) {
    return c.json({
      error: `Cannot transition from "${fromStatus}" to "${newStatus}"`,
      allowed,
    }, 400);
  }

  // Build update payload
  const update: Record<string, unknown> = {
    verification_status: newStatus,
  };
  if (newStatus === "approved") {
    update.verified_at = new Date().toISOString();
    update.verified_by = admin.id;
    update.rejection_reason = null;
  }
  if (newStatus === "rejected") {
    update.rejection_reason = notes || null;
    update.verified_by = admin.id;
  }
  if (newStatus === "docs_requested" || newStatus === "in_review") {
    update.verified_by = admin.id;
  }
  if (typeof internal_notes === "string" && internal_notes.length > 0) {
    update.verification_notes = internal_notes;
  } else if (newStatus === "docs_requested" && notes) {
    // When asking for docs, store the visible message as verification_notes
    // so the merchant can see what was requested.
    update.verification_notes = notes;
  }

  const { data: updated, error: updateErr } = await sb
    .from("merchants")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return c.json({ error: updateErr.message }, 500);

  // Write merchant_audit_log row
  await sb.from("merchant_audit_log").insert({
    merchant_id: id,
    actor_id: admin.id,
    actor_email: admin.email,
    action: "status_changed",
    from_status: fromStatus,
    to_status: newStatus,
    notes: notes || null,
    internal_notes: internal_notes || null,
  });

  // Insert in-app notification (skip "in_review" - that's internal-only)
  if (newStatus !== "in_review") {
    const title =
      newStatus === "approved"
        ? "Your restaurant is approved!"
        : newStatus === "rejected"
        ? "Application not approved"
        : newStatus === "docs_requested"
        ? "Additional info needed"
        : `Status: ${newStatus}`;
    const bodyText =
      newStatus === "approved"
        ? "Congratulations! Your restaurant is now live on Roam Dash and visible to customers."
        : newStatus === "rejected"
        ? notes || "Please review the reason and edit your application to resubmit."
        : newStatus === "docs_requested"
        ? notes || "Please log in and update the requested information."
        : `Your status was changed to ${newStatus}.`;
    await sb.from("merchant_notifications").insert({
      merchant_id: id,
      type: "verification_status_change",
      title,
      body: bodyText,
    });
  }

  // Send email if we have a recipient email
  const merchantEmail = (updated as Record<string, unknown>).email as string | undefined;
  if (merchantEmail) {
    const tpl = renderStatusEmail(newStatus, {
      name: (updated as Record<string, unknown>).name as string,
      rejection_reason: (updated as Record<string, unknown>).rejection_reason as string | null,
      verification_notes: (updated as Record<string, unknown>).verification_notes as string | null,
    });
    const result = await sendNotificationEmail({
      to: merchantEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    if (result.sent) {
      // Mark the latest unsent notification as email sent
      const { data: latestUnsent } = await sb
        .from("merchant_notifications")
        .select("id")
        .eq("merchant_id", id)
        .is("email_sent_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestUnsent) {
        await sb
          .from("merchant_notifications")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", (latestUnsent as Record<string, unknown>).id as string);
      }
    }
  }

  // Also log to the platform-wide admin audit log so it appears in Activity Log.
  // The KV store is in the public schema and owned by the fleet make-server,
  // but any service-role client can write to it directly.
  try {
    const kvClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ts = new Date();
    const tsKey = ts.toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 8);
    await kvClient.from("kv_store_37f42386").upsert({
      key: `audit:${tsKey}:${suffix}`,
      value: {
        actorId: admin.id,
        actorName: admin.email || "Admin",
        action: "roam_dash.merchant_status_changed",
        targetId: id,
        targetEmail: merchantEmail || "",
        details: `${fromStatus} -> ${newStatus}${notes ? ` (${notes})` : ""}`,
        timestamp: ts.toISOString(),
      },
    });
  } catch (e) {
    console.error("[audit-bridge] failed to write KV audit entry:", e);
  }

  return c.json({ merchant: updated });
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

Deno.serve(app.fetch);
