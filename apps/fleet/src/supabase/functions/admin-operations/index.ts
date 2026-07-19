import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import type { Context, Next } from "npm:hono";
import { checkRateLimit, recordFailedAttempt, getClientIp } from "../server/rate_limiter.ts";
import { ensureBucket } from "../server/storage_buckets.ts";

// ---------------------------------------------------------------------------
// Wave 5: Env boot validation
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [!SUPABASE_URL && "SUPABASE_URL", !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  console.error(`[AdminOps] FATAL: Missing required env: ${missing.join(", ")}`);
  throw new Error(`[AdminOps] Missing required env: ${missing.join(", ")}`);
}

const app = new Hono();

/** Wave 6: Safe error response for admin endpoints. Logs real error, returns sanitized 500. */
function safeAdminError(c: Context, e: unknown, prefix: string): Response {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(`[${prefix}] Internal error:`, err.message, err.stack);
  return c.json({ error: "internal_error", code: "INTERNAL", message: "Something went wrong" }, 500);
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Wave 1B: Local platform admin middleware for admin-operations.
 * Cross-import from server/rbac_middleware.ts may not work for sibling functions,
 * so we implement a local check that validates Bearer JWT and confirms platform role.
 */
async function requirePlatformAdmin(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized: No token provided' }, 401);
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      console.warn('[AdminOps] STRICT: Rejected invalid/anon token');
      return c.json({ 
        error: 'Unauthorized: Valid authentication required',
        code: 'AUTH_REQUIRED',
      }, 401);
    }

    // Check for platform admin role
    const appMeta = (data.user.app_metadata || {}) as Record<string, unknown>;
    const userMeta = (data.user.user_metadata || {}) as Record<string, unknown>;
    const rawRole = String(appMeta.role || userMeta.role || '');
    const roles = Array.isArray(appMeta.roles) ? appMeta.roles : [];

    const isPlatformAdmin = 
      rawRole === 'superadmin' || 
      rawRole === 'platform_owner' ||
      rawRole === 'admin' ||
      roles.includes('superadmin') ||
      roles.includes('platform_owner');

    if (!isPlatformAdmin) {
      console.warn(`[AdminOps] FORBIDDEN: User ${data.user.id} (role=${rawRole}) is not a platform admin`);
      return c.json({
        error: 'Forbidden: Platform admin access required',
        code: 'ADMIN_REQUIRED',
      }, 403);
    }

    // Store user context
    c.set('adminUser', {
      userId: data.user.id,
      email: data.user.email || '',
      role: rawRole,
    });

    await next();
  } catch (err) {
    console.error('[AdminOps] Auth error:', err);
    return c.json({ error: 'Authentication error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Wave 5: CORS Allowlist (env-driven)
// ---------------------------------------------------------------------------
function buildCorsOriginFn(): (origin: string) => string | null {
  const rawEnv = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const envMode = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "").toLowerCase();
  const isDev = envMode === "development" || envMode === "local" || envMode === "";

  const allowed = rawEnv
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0 && isDev) {
    return () => "*";
  }

  const viteUrl = Deno.env.get("VITE_APP_URL") ?? "";
  if (viteUrl) allowed.push(viteUrl.toLowerCase());
  if (SUPABASE_URL) allowed.push(SUPABASE_URL.toLowerCase());

  const allowSet = new Set(allowed);

  return (origin: string): string | null => {
    if (!origin) return null;
    const lower = origin.toLowerCase();
    if (allowSet.has(lower)) return origin;
    for (const a of allowSet) {
      if (lower.endsWith(`.${a.replace(/^https?:\/\//, "")}`)) return origin;
      if (lower === a) return origin;
    }
    return null;
  };
}

const corsOriginFn = buildCorsOriginFn();

app.use('*', logger(console.log));
app.use(
  "/*",
  cors({
    origin: corsOriginFn,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check is public (no auth required)
app.get("/admin-operations/health", (c) => c.json({ status: "ok" }));

// --- BATCHES ---
app.get("/admin-operations/batches", requirePlatformAdmin, async (c) => {
  try {
    const batches = await kv.getByPrefix("batch:");
    if (Array.isArray(batches)) {
        batches.sort((a: any, b: any) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
    }
    return c.json(batches || []);
  } catch (e: any) {
    return safeAdminError(c, e, "AdminOps.batches");
  }
});

app.post("/admin-operations/batches", requirePlatformAdmin, async (c) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) batch.id = crypto.randomUUID();
    await kv.set(`batch:${batch.id}`, batch);
    return c.json({ success: true, data: batch });
  } catch (e: any) {
    return safeAdminError(c, e, "AdminOps.batchesPost");
  }
});

app.delete("/admin-operations/batches/:id", requirePlatformAdmin, async (c) => {
  const batchId = c.req.param("id");
  try {
    const allTrips = await kv.getByPrefix("trip:");
    const tripsToDelete = (allTrips || []).filter((t: any) => t.batchId === batchId);
    if (tripsToDelete.length > 0) {
        const keys = tripsToDelete.map((t: any) => `trip:${t.id}`);
        for (let i = 0; i < keys.length; i += 100) await kv.mdel(keys.slice(i, i + 100));
    }
    const allTransactions = await kv.getByPrefix("transaction:");
    const txToDelete = (allTransactions || []).filter((t: any) => t.batchId === batchId);
    if (txToDelete.length > 0) {
        const keys = txToDelete.map((t: any) => `transaction:${t.id}`);
        for (let i = 0; i < keys.length; i += 100) await kv.mdel(keys.slice(i, i + 100));
    }
    // Cleanup ghosts if needed (simplified)
    await kv.del(`batch:${batchId}`);
    return c.json({ success: true });
  } catch (e: any) {
    return safeAdminError(c, e, "AdminOps.batchDelete");
  }
});

// --- ADMIN RESET ---
// Wave 1B: These stubs return 501 Not Implemented — never fake success
app.post("/admin-operations/admin/preview-reset", requirePlatformAdmin, async (c) => {
    return c.json({ 
      error: "not_implemented", 
      message: "preview-reset is not implemented. Use the full admin panel for reset operations." 
    }, 501);
});

app.post("/admin-operations/admin/reset-by-date", requirePlatformAdmin, async (c) => {
    return c.json({ 
      error: "not_implemented", 
      message: "reset-by-date is not implemented. Use the full admin panel for reset operations." 
    }, 501);
});

// --- USERS ---
app.get("/admin-operations/users", requirePlatformAdmin, async (c) => {
    // List users via Supabase Admin API
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(users);
});

app.post("/admin-operations/invite-user", requirePlatformAdmin, async (c) => {
    // FIX: Add rate limiting to prevent abuse of user invite operations
    const clientIp = getClientIp(c);
    const adminUser = c.get("adminUser") as { userId?: string } | undefined;
    const userId = adminUser?.userId || "unknown";
    const rateLimitKey = `${clientIp}:${userId}`;
    
    const rateCheck = await checkRateLimit(rateLimitKey, "admin");
    if (!rateCheck.allowed) {
        console.warn(`[AdminOps] Rate limit exceeded for invite-user: ${rateLimitKey}`);
        return c.json({ 
            error: "rate_limit_exceeded", 
            message: `Too many requests. Please wait ${rateCheck.retryAfterSec} seconds.`,
            retryAfter: rateCheck.retryAfterSec 
        }, 429);
    }

    try {
        const { email, password, name, role } = await c.req.json();
        const { data, error } = await supabase.auth.admin.createUser({
            email, password, user_metadata: { name, role }, email_confirm: true
        });
        if (error) {
            await recordFailedAttempt(rateLimitKey, "admin");
            return c.json({ error: error.message }, 400);
        }
        return c.json({ success: true, user: data.user });
    } catch (e: any) {
        await recordFailedAttempt(rateLimitKey, "admin");
        throw e;
    }
});

app.post("/admin-operations/delete-user", requirePlatformAdmin, async (c) => {
    // FIX: Add rate limiting to prevent abuse of user deletion operations
    const clientIp = getClientIp(c);
    const adminUser = c.get("adminUser") as { userId?: string } | undefined;
    const userId = adminUser?.userId || "unknown";
    const rateLimitKey = `${clientIp}:${userId}`;
    
    const rateCheck = await checkRateLimit(rateLimitKey, "admin");
    if (!rateCheck.allowed) {
        console.warn(`[AdminOps] Rate limit exceeded for delete-user: ${rateLimitKey}`);
        return c.json({ 
            error: "rate_limit_exceeded", 
            message: `Too many requests. Please wait ${rateCheck.retryAfterSec} seconds.`,
            retryAfter: rateCheck.retryAfterSec 
        }, 429);
    }

    try {
        const { userId: targetUserId } = await c.req.json();
        const { error } = await supabase.auth.admin.deleteUser(targetUserId);
        if (error) {
            await recordFailedAttempt(rateLimitKey, "admin");
            return c.json({ error: error.message }, 400);
        }
        // Cleanup driver profile
        await kv.del(`driver:${targetUserId}`);
        return c.json({ success: true });
    } catch (e: any) {
        await recordFailedAttempt(rateLimitKey, "admin");
        throw e;
    }
});

// --- NOTIFICATIONS ---
app.get("/admin-operations/notifications", requirePlatformAdmin, async (c) => {
  try {
    const notifications = await kv.getByPrefix("notification:");
    if (Array.isArray(notifications)) {
        notifications.sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    }
    return c.json(notifications || []);
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.notifications"); }
});

app.post("/admin-operations/notifications", requirePlatformAdmin, async (c) => {
  try {
    const n = await c.req.json();
    if (!n.id) n.id = crypto.randomUUID();
    if (!n.timestamp) n.timestamp = new Date().toISOString();
    await kv.set(`notification:${n.id}`, n);
    return c.json({ success: true, data: n });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.notificationsPost"); }
});

app.patch("/admin-operations/notifications/:id/read", requirePlatformAdmin, async (c) => {
  const id = c.req.param("id");
  try {
    const n = await kv.get(`notification:${id}`);
    if (n) { n.read = true; await kv.set(`notification:${id}`, n); }
    return c.json({ success: true, data: n });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.notificationRead"); }
});

// --- ALERT RULES ---
app.get("/admin-operations/alert-rules", requirePlatformAdmin, async (c) => {
  try {
    const rules = await kv.getByPrefix("alert_rule:");
    return c.json(rules || []);
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.alertRules"); }
});

app.post("/admin-operations/alert-rules", requirePlatformAdmin, async (c) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) rule.id = crypto.randomUUID();
    await kv.set(`alert_rule:${rule.id}`, rule);
    return c.json({ success: true, data: rule });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.alertRulesPost"); }
});

app.delete("/admin-operations/alert-rules/:id", requirePlatformAdmin, async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`alert_rule:${id}`); return c.json({ success: true }); }
  catch (e: any) { return safeAdminError(c, e, "AdminOps.alertRuleDelete"); }
});

// --- SETTINGS ---
app.get("/admin-operations/settings/preferences", requirePlatformAdmin, async (c) => {
  try {
    const preferences = await kv.get("preferences:general");
    return c.json(preferences || {});
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.preferences"); }
});

app.post("/admin-operations/settings/preferences", requirePlatformAdmin, async (c) => {
  try {
    const preferences = await c.req.json();
    await kv.set("preferences:general", preferences);
    return c.json({ success: true, data: preferences });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.preferencesPost"); }
});

app.get("/admin-operations/settings/integrations", requirePlatformAdmin, async (c) => {
  try {
    const integrations = await kv.getByPrefix("integration:");
    return c.json(integrations || []);
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.integrations"); }
});

app.post("/admin-operations/settings/integrations", requirePlatformAdmin, async (c) => {
  try {
    const integration = await c.req.json();
    if (!integration.id) return c.json({ error: "ID required" }, 400);
    await kv.set(`integration:${integration.id}`, integration);
    return c.json({ success: true, data: integration });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.integrationsPost"); }
});

// --- UPLOAD ---
app.post("/admin-operations/upload", requirePlatformAdmin, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400);
    const bucketName = "make-37f42386-docs";
    await ensureBucket(supabase, "make-37f42386-docs");
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `driver-docs/${fileName}`;
    const { error } = await supabase.storage.from(bucketName).upload(filePath, file, { contentType: file.type });
    if (error) throw error;
    const { data: signedData } = await supabase.storage.from(bucketName).createSignedUrl(filePath, 31536000);
    return c.json({ url: signedData?.signedUrl });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.upload"); }
});

// --- UBER INTEGRATION ---
app.get("/admin-operations/uber/auth-url", requirePlatformAdmin, async (c) => {
  try {
    const integration = await kv.get("integration:uber");
    if (!integration?.credentials?.clientId) return c.json({ error: "Uber not configured" }, 400);
    const redirectUri = c.req.query("redirect_uri") || "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/admin-operations/uber/callback";
    const clientId = integration.credentials.clientId;
    const scope = c.req.query("scope") || "profile";
    const authUrl = `https://login.uber.com/oauth/v2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    return c.json({ url: authUrl });
  } catch (e: any) { return safeAdminError(c, e, "AdminOps.uberAuthUrl"); }
});

app.post("/admin-operations/uber/exchange", requirePlatformAdmin, async (c) => {
    try {
        const { code, redirect_uri } = await c.req.json();
        const integration = await kv.get("integration:uber");
        if (!integration?.credentials) return c.json({ error: "Settings missing" }, 400);
        const { clientId, clientSecret } = integration.credentials;
        const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", redirect_uri, code });
        const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) return c.json({ error: "Exchange failed", details: tokenData }, 400);
        const tokenStore = { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: Date.now() + (tokenData.expires_in * 1000), scope: tokenData.scope, token_type: tokenData.token_type };
        await kv.set("integration:uber_token", tokenStore);
        integration.status = 'connected';
        integration.lastConnected = new Date().toISOString();
        await kv.set("integration:uber", integration);
        return c.json({ success: true });
    } catch (e: any) { return safeAdminError(c, e, "AdminOps.uberExchange"); }
});

app.post("/admin-operations/uber/sync", requirePlatformAdmin, async (c) => {
    // Sync logic (simplified)
    try {
        let tokenStore = await kv.get("integration:uber_token");
        if (!tokenStore?.access_token) return c.json({ error: "Uber not connected", code: "AUTH_REQUIRED" }, 401);
        // Refresh logic omitted for brevity, assume valid or handle error
        const historyRes = await fetch("https://api.uber.com/v1.2/history?limit=50", { headers: { "Authorization": `Bearer ${tokenStore.access_token}`, "Content-Type": "application/json" } });
        if (historyRes.ok) {
            const data = await historyRes.json();
            const trips = data.history.map((t: any) => ({ trip_id: t.request_id, date: new Date(t.start_time * 1000).toISOString(), platform: 'Uber', driverId: 'Self', pickupLocation: t.start_city?.display_name, dropoffLocation: t.end_city?.display_name, amount: 0, status: t.status, source: 'uber_oauth_api' }));
            return c.json({ success: true, trips });
        }
        return c.json({ error: "internal_error", code: "INTERNAL", message: "Something went wrong" }, 500);
    } catch(e: any) { return safeAdminError(c, e, "AdminOps.uberSync"); }
});

Deno.serve(async (req) => {
  try {
    return await app.fetch(req);
  } catch (err: any) {
    console.error("Critical Server Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
