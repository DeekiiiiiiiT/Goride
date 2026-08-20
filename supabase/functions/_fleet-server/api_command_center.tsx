/**
 * api_command_center.tsx
 *
 * Edge routes that power the Super Admin "API Command Center". Provides:
 *   - Aggregated summary / time-series / detailed call log reads.
 *   - Masked API-key listing with rotation via the Supabase Management API.
 *   - Per-provider budget caps and kill-switches (read/write).
 *   - A scaffolded provider-billing sync (returns `not-configured` until
 *     OPENAI_ADMIN_API_KEY and GCP_BILLING_* env vars are set).
 *
 * All routes are mounted under `/make-server-37f42386/api-center/*` and gated
 * by `requireAuth()` + an inline platform-role check.
 */

import { Hono } from "npm:hono";
import type { Context, Next } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, type RbacUser } from "./rbac_middleware.ts";
import { logAdminAction } from "./audit_log.ts";
import { getPricingTable } from "./api_pricing.ts";
import type { Provider } from "./api_pricing.ts";
import type {
  BudgetConfig,
  KillswitchConfig,
  ProviderAggregate,
} from "./api_usage_logger.ts";
import {
  buildRadar,
  getAlertConfig,
  getLatestSummary,
  saveAlertConfig,
  syncUsageSnapshot,
} from "./supabase_platform_usage.ts";

const app = new Hono();
const BASE = "/make-server-37f42386";
const SUPPORTED_PROVIDERS: Provider[] = ["openai", "gemini", "google_maps", "supabase", "uber"];

// ---------------------------------------------------------------------------
// Role gate: mirror of AdminLayout PLATFORM_ROLE_PAGES.
//
//   requirePlatform("read")  — platform_owner OR platform_analyst
//   requirePlatform("write") — platform_owner only
// ---------------------------------------------------------------------------
function requirePlatform(mode: "read" | "write") {
  return async (c: Context, next: Next) => {
    const user = c.get("rbacUser") as RbacUser | undefined;
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const role = user.resolvedRole;
    const ok =
      mode === "read"
        ? role === "platform_owner" || role === "platform_analyst"
        : role === "platform_owner";
    if (!ok) {
      return c.json(
        { error: "Forbidden", message: `Requires platform_owner${mode === "read" ? " / platform_analyst" : ""} role.` },
        403
      );
    }
    await next();
  };
}

function todayYMD(d: Date = new Date()) { return d.toISOString().slice(0, 10); }
function thisMonthYM(d: Date = new Date()) { return d.toISOString().slice(0, 7); }
function ymdNDaysAgo(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function maskKey(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// GET /api-center/summary — per-provider cards
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/summary`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const rangeParam = (c.req.query("range") || "mtd").toLowerCase();
    const today = todayYMD();
    const month = thisMonthYM();
    const days =
      rangeParam === "today" ? [today] :
      rangeParam === "7d"    ? ymdNDaysAgo(7) :
      rangeParam === "30d"   ? ymdNDaysAgo(30) :
                               ymdNDaysAgo(new Date().getUTCDate()); // mtd

    const perProvider = await Promise.all(SUPPORTED_PROVIDERS.map(async (provider) => {
      const monthAgg: ProviderAggregate | null = await kv.get(`api_usage_agg:${provider}:${month}`);
      const todayAgg: ProviderAggregate | null = await kv.get(`api_usage_agg:${provider}:${today}`);
      const rangeAggs: Array<ProviderAggregate | null> = await Promise.all(
        days.map((d) => kv.get(`api_usage_agg:${provider}:${d}`))
      );
      const budget: BudgetConfig | null = await kv.get(`api_budget:${provider}`);
      const killswitch: KillswitchConfig | null = await kv.get(`api_killswitch:${provider}`);

      const sum = (k: keyof ProviderAggregate) =>
        rangeAggs.reduce((acc: number, a) => acc + (a ? Number(a[k] || 0) : 0), 0);

      return {
        provider,
        today: {
          calls: todayAgg?.calls || 0,
          errors: todayAgg?.errors || 0,
          costUSD: todayAgg?.costUSD || 0,
        },
        month: {
          calls: monthAgg?.calls || 0,
          errors: monthAgg?.errors || 0,
          costUSD: monthAgg?.costUSD || 0,
        },
        range: {
          label: rangeParam,
          calls: sum("calls"),
          errors: sum("errors"),
          costUSD: sum("costUSD"),
          inputTokens: sum("inputTokens"),
          outputTokens: sum("outputTokens"),
          requests: sum("requests"),
        },
        budget: budget
          ? {
              monthlyBudgetUSD: budget.monthlyBudgetUSD || 0,
              dailyBudgetUSD: budget.dailyBudgetUSD || 0,
              hardStop: !!budget.hardStop,
              monthlyUtilization:
                budget.monthlyBudgetUSD > 0
                  ? Math.min(100, ((monthAgg?.costUSD || 0) / budget.monthlyBudgetUSD) * 100)
                  : 0,
            }
          : null,
        killswitch: killswitch
          ? { disabled: !!killswitch.disabled, reason: killswitch.reason, by: killswitch.by, at: killswitch.at }
          : { disabled: false },
      };
    }));

    return c.json({ range: rangeParam, generatedAt: new Date().toISOString(), providers: perProvider });
  } catch (e: any) {
    console.error("[ApiCenter] summary error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api-center/usage — per-day time-series for a provider
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/usage`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const provider = (c.req.query("provider") || "openai") as Provider;
    if (!SUPPORTED_PROVIDERS.includes(provider)) return c.json({ error: "Invalid provider" }, 400);
    const rangeParam = (c.req.query("range") || "30d").toLowerCase();
    const n = rangeParam === "7d" ? 7 : rangeParam === "mtd" ? new Date().getUTCDate() : 30;
    const days = ymdNDaysAgo(n).reverse();

    const series = await Promise.all(days.map(async (d) => {
      const agg: ProviderAggregate | null = await kv.get(`api_usage_agg:${provider}:${d}`);
      return {
        date: d,
        calls: agg?.calls || 0,
        errors: agg?.errors || 0,
        costUSD: agg?.costUSD || 0,
        inputTokens: agg?.inputTokens || 0,
        outputTokens: agg?.outputTokens || 0,
        requests: agg?.requests || 0,
      };
    }));

    // Top routes within the window: scan last 24h of detail rows and bucket by route.
    // (For a tiny implementation this is acceptable; larger datasets can move to
    //  a dedicated aggregation key in a follow-up.)
    const recent = await kv.getByPrefix(`api_usage:${todayYMD()}:`);
    const filtered = (recent || []).filter((r: any) => r?.provider === provider);
    const byRoute: Record<string, { route: string; calls: number; costUSD: number }> = {};
    for (const r of filtered) {
      const k = r.route || "(unknown)";
      byRoute[k] = byRoute[k] || { route: k, calls: 0, costUSD: 0 };
      byRoute[k].calls += 1;
      byRoute[k].costUSD += r.costUSD || 0;
    }
    const topRoutes = Object.values(byRoute).sort((a, b) => b.costUSD - a.costUSD).slice(0, 10);

    return c.json({ provider, range: rangeParam, series, topRoutes });
  } catch (e: any) {
    console.error("[ApiCenter] usage error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api-center/logs — paginated call-log (cursor = ISO date string)
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/logs`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const provider = c.req.query("provider") || "";
    const status = c.req.query("status") || "";
    const q = (c.req.query("q") || "").toLowerCase();
    const limit = Math.min(200, parseInt(c.req.query("limit") || "100"));
    const cursor = c.req.query("cursor"); // YMD

    // Sweep the last 7 days of detail rows; fine for the initial implementation.
    const days = cursor ? [cursor] : ymdNDaysAgo(7);
    const collected: any[] = [];
    for (const d of days) {
      const rows = await kv.getByPrefix(`api_usage:${d}:`);
      for (const r of rows || []) {
        if (provider && r.provider !== provider) continue;
        if (status && r.status !== status) continue;
        if (q) {
          const hay = `${r.route || ""} ${r.model || ""} ${r.errorMessage || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        collected.push(r);
      }
      if (collected.length >= limit) break;
    }

    collected.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const slice = collected.slice(0, limit);

    return c.json({
      rows: slice,
      nextCursor: slice.length === limit ? days[days.length - 1] : null,
    });
  } catch (e: any) {
    console.error("[ApiCenter] logs error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api-center/keys — masked listing
// ---------------------------------------------------------------------------
const KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  google_maps: "GOOGLE_MAPS_API_KEY",
  supabase: "SUPABASE_SERVICE_ROLE_KEY",
  // Masking uses secret; pair with UBER_CLIENT_ID (also required for Vehicles API).
  uber: "UBER_CLIENT_SECRET",
};

app.get(`${BASE}/api-center/keys`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const out = await Promise.all(SUPPORTED_PROVIDERS.map(async (provider) => {
      const envName = KEY_ENV[provider];
      const raw = Deno.env.get(envName) || "";
      const audit: any = await kv.get(`api_key_meta:${provider}`);
      return {
        provider,
        envVarName: envName,
        configured: !!raw,
        maskedKey: maskKey(raw),
        lastRotatedAt: audit?.lastRotatedAt || null,
        lastRotatedBy: audit?.lastRotatedBy || null,
      };
    }));
    return c.json({ keys: out });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api-center/keys/rotate — Supabase Management API upsert
// ---------------------------------------------------------------------------
async function validateProviderKey(provider: Provider, key: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return { ok: false, detail: `OpenAI /models returned ${r.status}` };
      return { ok: true };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (!r.ok) return { ok: false, detail: `Google AI /models returned ${r.status}` };
      return { ok: true };
    }
    if (provider === "google_maps") {
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Kingston,Jamaica&key=${encodeURIComponent(key)}`);
      const body = await r.json();
      if (body?.status === "REQUEST_DENIED") return { ok: false, detail: body?.error_message || "REQUEST_DENIED" };
      return { ok: true };
    }
    // supabase — skip live ping. uber — optional Client Credentials probe when both env vars set.
    if (provider === "uber") {
      const clientId = Deno.env.get("UBER_CLIENT_ID") || "";
      if (!clientId) return { ok: true, detail: "UBER_CLIENT_ID not set; secret shape accepted without live ping." };
      const body = new URLSearchParams();
      body.append("client_id", clientId);
      body.append("client_secret", key);
      body.append("grant_type", "client_credentials");
      body.append(
        "scope",
        Deno.env.get("UBER_FLEET_SCOPES") ||
          "vehicle_suppliers.vehicles.read vehicle_suppliers.vehicles.assignment vehicle_suppliers.organizations.read solutions.suppliers.reports solutions.suppliers.metrics.read supplier.partner.payments",
      );
      const r = await fetch("https://auth.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return {
          ok: false,
          detail: err?.error_description || err?.error || `Uber token endpoint returned ${r.status}`,
        };
      }
      return { ok: true };
    }
    return { ok: true, detail: "Validation skipped for this provider." };
  } catch (e: any) {
    return { ok: false, detail: e.message };
  }
}

app.post(`${BASE}/api-center/keys/rotate`, requireAuth(), requirePlatform("write"), async (c) => {
  try {
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();
    const provider = body.provider as Provider;
    const newKey: string = (body.newKey || "").trim();
    const reason: string = body.reason || "";

    if (!SUPPORTED_PROVIDERS.includes(provider)) return c.json({ error: "Invalid provider" }, 400);
    if (!newKey) return c.json({ error: "newKey is required" }, 400);

    // Step 1 — validate live with the provider so we fail fast on bad keys.
    const validation = await validateProviderKey(provider, newKey);
    if (!validation.ok) {
      return c.json({ error: "Provider validation failed", detail: validation.detail }, 422);
    }

    // Step 2 — push to Supabase Management API.
    const pat = Deno.env.get("SUPABASE_PAT");
    const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") ||
      (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];

    if (!pat || !projectRef) {
      return c.json(
        {
          error: "Rotation backend not configured",
          detail:
            "Set SUPABASE_PAT (Personal Access Token) and SUPABASE_PROJECT_REF as function secrets to enable key rotation.",
        },
        503
      );
    }

    const envName = KEY_ENV[provider];
    const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ name: envName, value: newKey }]),
    });

    if (!mgmtRes.ok) {
      const mgmtBody = await mgmtRes.text();
      return c.json({ error: "Management API rotation failed", status: mgmtRes.status, detail: mgmtBody }, 502);
    }

    // Step 3 — write audit + meta.
    const oldKey = Deno.env.get(envName) || "";
    const auditId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newHash = await sha256Hex(newKey);

    await kv.set(`api_key_audit:${auditId}`, {
      id: auditId,
      provider,
      by: user.email || user.userId,
      at: now,
      oldKeyTail: oldKey.slice(-4),
      newKeyTail: newKey.slice(-4),
      newKeyHash: newHash,
      reason,
    });
    await kv.set(`api_key_meta:${provider}`, {
      provider,
      lastRotatedAt: now,
      lastRotatedBy: user.email || user.userId,
      newKeyTail: newKey.slice(-4),
      newKeyHash: newHash,
    });

    await logAdminAction({
      actorId: user.userId,
      actorName: user.email,
      action: `API_KEY_ROTATED`,
      targetId: provider,
      targetEmail: envName,
      details: `Provider ${provider} rotated. ${reason || ""}`.trim(),
    });

    return c.json({
      ok: true,
      provider,
      propagationNote:
        "Supabase edge workers will pick up the new secret on the next cold start (seconds to a minute).",
    });
  } catch (e: any) {
    console.error("[ApiCenter] rotate error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/budgets`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const entries = await Promise.all(SUPPORTED_PROVIDERS.map(async (p) => {
      const v: BudgetConfig | null = await kv.get(`api_budget:${p}`);
      return v || { provider: p, monthlyBudgetUSD: 0, dailyBudgetUSD: 0, hardStop: false };
    }));
    return c.json({ budgets: entries });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.put(`${BASE}/api-center/budgets`, requireAuth(), requirePlatform("write"), async (c) => {
  try {
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();
    const provider = body.provider as Provider;
    if (!SUPPORTED_PROVIDERS.includes(provider)) return c.json({ error: "Invalid provider" }, 400);
    const config: BudgetConfig = {
      provider,
      monthlyBudgetUSD: Number(body.monthlyBudgetUSD) || 0,
      dailyBudgetUSD: Number(body.dailyBudgetUSD) || 0,
      hardStop: !!body.hardStop,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email || user.userId,
    };
    await kv.set(`api_budget:${provider}`, config);
    await logAdminAction({
      actorId: user.userId,
      actorName: user.email,
      action: "API_BUDGET_UPDATED",
      targetId: provider,
      targetEmail: provider,
      details: `monthly=$${config.monthlyBudgetUSD} daily=$${config.dailyBudgetUSD} hardStop=${config.hardStop}`,
    });
    return c.json({ ok: true, budget: config });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/killswitch`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const entries = await Promise.all(SUPPORTED_PROVIDERS.map(async (p) => {
      const v: KillswitchConfig | null = await kv.get(`api_killswitch:${p}`);
      return v || { provider: p, disabled: false };
    }));
    return c.json({ killswitches: entries });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.put(`${BASE}/api-center/killswitch`, requireAuth(), requirePlatform("write"), async (c) => {
  try {
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();
    const provider = body.provider as Provider;
    if (!SUPPORTED_PROVIDERS.includes(provider)) return c.json({ error: "Invalid provider" }, 400);
    const now = new Date().toISOString();
    const config: KillswitchConfig = {
      provider,
      disabled: !!body.disabled,
      reason: body.reason || "",
      by: user.email || user.userId,
      at: now,
    };
    await kv.set(`api_killswitch:${provider}`, config);
    await logAdminAction({
      actorId: user.userId,
      actorName: user.email,
      action: config.disabled ? "API_KILLSWITCH_ON" : "API_KILLSWITCH_OFF",
      targetId: provider,
      targetEmail: provider,
      details: body.reason || "",
    });
    return c.json({ ok: true, killswitch: config });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ---------------------------------------------------------------------------
// Pricing table (surfaced to the UI so users can sanity-check estimate rates)
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/pricing`, requireAuth(), requirePlatform("read"), (c) => {
  return c.json({ pricing: getPricingTable() });
});

// ---------------------------------------------------------------------------
// Provider-billing sync — scaffold. Returns `not-configured` unless the
// OpenAI Admin API Key and GCP billing credentials are set.
// ---------------------------------------------------------------------------
app.post(`${BASE}/api-center/billing/sync`, requireAuth(), requirePlatform("write"), async (c) => {
  const openaiAdmin = Deno.env.get("OPENAI_ADMIN_API_KEY");
  const gcpBillingAccount = Deno.env.get("GCP_BILLING_ACCOUNT_ID");
  const configured = !!openaiAdmin || !!gcpBillingAccount;
  if (!configured) {
    return c.json({
      ok: false,
      reason: "not-configured",
      detail:
        "Configure OPENAI_ADMIN_API_KEY and/or GCP_BILLING_ACCOUNT_ID (plus BigQuery export) as function secrets to enable real-billing sync.",
    });
  }
  // Real implementation TODO — write api_billing_actual:{provider}:{YYYY-MM}.
  return c.json({
    ok: true,
    reason: "stub",
    detail: "Credentials detected but sync job not yet implemented in this scaffold.",
    detectedProviders: {
      openai: !!openaiAdmin,
      google_cloud: !!gcpBillingAccount,
    },
  });
});

app.get(`${BASE}/api-center/billing/status`, requireAuth(), requirePlatform("read"), (c) => {
  return c.json({
    configured: {
      openai: !!Deno.env.get("OPENAI_ADMIN_API_KEY"),
      google_cloud: !!Deno.env.get("GCP_BILLING_ACCOUNT_ID"),
    },
    supportedProviders: SUPPORTED_PROVIDERS,
  });
});

// ---------------------------------------------------------------------------
// Supabase Platform Usage — gauges, sync, radar, alerts
// ---------------------------------------------------------------------------
app.get(`${BASE}/api-center/supabase/summary`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const summary = await getLatestSummary();
    return c.json(summary);
  } catch (e: any) {
    return c.json({ error: e?.message || "Failed to load Supabase usage summary" }, 500);
  }
});

app.post(`${BASE}/api-center/supabase/sync`, requireAuth(), requirePlatform("write"), async (c) => {
  try {
    const force = c.req.query("force") === "1";
    const result = await syncUsageSnapshot({ force });
    if (!result.ok && result.reason === "not-configured") {
      return c.json(result, 503);
    }
    if (!result.ok) return c.json(result, 502);
    const user = c.get("rbacUser") as RbacUser;
    await logAdminAction({
      actorId: user.userId,
      actorName: user.email || user.userId,
      action: "SUPABASE_USAGE_SYNC",
      targetId: "supabase",
      targetEmail: result.snapshot?.orgSlug || "supabase",
      details: `reason=${result.reason || "ok"} syncedAt=${result.snapshot?.syncedAt || ""}`,
    }).catch(() => {});
    return c.json(result);
  } catch (e: any) {
    return c.json({ ok: false, reason: "error", detail: e?.message || String(e) }, 500);
  }
});

/** Hourly cron — Authorization via FLEET_CRON_SECRET / RIDES_CRON_SECRET */
app.post(`${BASE}/api-center/supabase/sync-cron`, async (c) => {
  try {
    const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
    if (!secret) return c.json({ error: "Cron secret not configured" }, 503);
    const hdr =
      c.req.header("X-Fleet-Cron-Secret") ||
      c.req.header("X-Rides-Cron-Secret") ||
      c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (hdr !== secret) return c.json({ error: "Unauthorized" }, 401);
    const result = await syncUsageSnapshot({ force: true });
    return c.json(result, result.ok ? 200 : 502);
  } catch (e: any) {
    return c.json({ ok: false, reason: "error", detail: e?.message || String(e) }, 500);
  }
});

app.get(`${BASE}/api-center/supabase/radar`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const range = (c.req.query("range") || "24h").toLowerCase() === "7d" ? "7d" : "24h";
    const radar = await buildRadar(range);
    return c.json(radar);
  } catch (e: any) {
    return c.json({ error: e?.message || "Failed to build leak radar" }, 500);
  }
});

app.get(`${BASE}/api-center/supabase/alerts`, requireAuth(), requirePlatform("read"), async (c) => {
  try {
    const alerts = await getAlertConfig();
    return c.json({ alerts });
  } catch (e: any) {
    return c.json({ error: e?.message || "Failed to load alerts" }, 500);
  }
});

app.put(`${BASE}/api-center/supabase/alerts`, requireAuth(), requirePlatform("write"), async (c) => {
  try {
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json().catch(() => ({}));
    const alerts = await saveAlertConfig(body || {}, user.email || user.userId);
    return c.json({ alerts });
  } catch (e: any) {
    return c.json({ error: e?.message || "Failed to save alerts" }, 400);
  }
});

export default app;
