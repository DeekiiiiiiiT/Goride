/**
 * Refinery prices. The function name and cron URL stay petrojam-prices.
 * Petrojam is one refinery. A changed week is kept as a new revision.
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { PETROJAM_PRICE_URL, type PetrojamSyncMode } from "./scrape.ts";
import { syncActiveRefineries, syncOneRefinery, writeRefinerySnapshot, type ActiveRefinery } from "./refinerySync.ts";

const app = new Hono().basePath("/petrojam-prices");

app.use("*", cors());

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "petrojam-prices", ts: new Date().toISOString(), ...payload }));
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function jsonError(message: string, status = 500) {
  return { error: message, message };
}

async function markEngineStale(db: SupabaseClient) {
  const { data: latest, error } = await db.schema("places").rpc("latest_petrojam_date");
  if (error || !latest) return;
  const { error: staleError } = await db.schema("places").rpc("price_engine_mark_stale", { p_date: latest });
  if (staleError) logLine({ event: "price_engine_stale_failed", error: staleError.message });
}

async function readRefinery(db: SupabaseClient, slug: string): Promise<ActiveRefinery | null> {
  const { data, error } = await db.rpc("refinery_list");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ActiveRefinery[]).find((row) => row.slug === slug) ?? null;
}

app.get("/health", (c) => {
  return c.json({
    service: "petrojam-prices",
    status: "ok",
    source: PETROJAM_PRICE_URL,
    syncModes: ["latest", "year", "month", "all"],
  });
});

app.get("/admin/refineries", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const { data, error } = await svc().rpc("refinery_list");
  if (error) return c.json(jsonError(error.message), 500);
  const list = (data ?? []) as Array<Record<string, unknown>>;
  const benchmark = list.find((row) => row.is_benchmark) ?? null;
  return c.json({ refineries: list, benchmark });
});

app.get("/admin/refineries/:slug/board", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const week = c.req.query("week") || null;
  const { data, error } = await svc().rpc("refinery_board", { p_slug: c.req.param("slug"), p_week: week });
  if (error) return c.json(jsonError(error.message), 500);
  if (data && typeof data === "object" && (data as { error?: string }).error === "not_found") {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json(data);
});

app.get("/admin/refineries/:slug/series", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const products = (c.req.query("products") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await svc().rpc("refinery_series", {
    p_slug: c.req.param("slug"),
    p_products: products.length ? products : null,
    p_from: c.req.query("from") || null,
    p_to: c.req.query("to") || null,
    p_compare: c.req.query("compare") === "1",
  });
  if (error) return c.json(jsonError(error.message), 500);
  return c.json(data);
});

app.get("/admin/refineries/:slug/history", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const year = c.req.query("year");
  const page = c.req.query("page");
  const { data, error } = await svc().rpc("refinery_history", {
    p_slug: c.req.param("slug"),
    p_year: year ? Number(year) : null,
    p_page: page ? Number(page) : 1,
  });
  if (error) return c.json(jsonError(error.message), 500);
  return c.json(data);
});

app.get("/admin/refineries/:slug/versions", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const { data, error } = await svc().rpc("refinery_versions", {
    p_slug: c.req.param("slug"),
    p_product: c.req.query("product"),
    p_week: c.req.query("week"),
  });
  if (error) return c.json(jsonError(error.message), 500);
  return c.json({ versions: data ?? [] });
});

app.get("/admin/refineries/:slug/runs", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const { data, error } = await svc().rpc("refinery_runs", {
    p_slug: c.req.param("slug"),
    p_limit: Number(c.req.query("limit") || 10),
  });
  if (error) return c.json(jsonError(error.message), 500);
  return c.json(data);
});

app.post("/admin/refineries", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!dominionCan(auth.role, "catalog.write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { data, error } = await svc().rpc("refinery_save", {
    p_slug: null,
    p_patch: body,
    p_actor: auth.id,
    p_reason: body.reason ?? null,
  });
  if (error) return c.json(jsonError(error.message), 400);
  return c.json({ refinery: data });
});

app.patch("/admin/refineries/:slug", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!dominionCan(auth.role, "catalog.write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { data, error } = await svc().rpc("refinery_save", {
    p_slug: c.req.param("slug"),
    p_patch: body,
    p_actor: auth.id,
    p_reason: body.reason ?? null,
  });
  if (error) return c.json(jsonError(error.message), 400);
  return c.json({ refinery: data });
});

app.post("/admin/refineries/:slug/prices", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!dominionCan(auth.role, "catalog.write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => ({})) as {
    effective_date?: string;
    prices?: Record<string, number>;
    source_url?: string;
    reason?: string;
    document_name?: string;
    document_base64?: string;
  };
  if (!body.effective_date || !body.prices || !body.reason) {
    return c.json({ error: "invalid", message: "Date, prices, and a reason are required" }, 400);
  }
  const db = svc();
  const refinery = await readRefinery(db, c.req.param("slug"));
  if (!refinery) return c.json({ error: "not_found" }, 404);

  let sourceUrl = (body.source_url || "").trim();
  if (body.document_base64 && body.document_name) {
    const bytes = Uint8Array.from(atob(body.document_base64), (ch) => ch.charCodeAt(0));
    const path = `${refinery.slug}/${body.effective_date}/${body.document_name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: uploadError } = await db.storage.from("refinery-price-sources").upload(path, bytes, {
      upsert: true,
      contentType: body.document_name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
    });
    if (uploadError) return c.json(jsonError(uploadError.message), 400);
    if (!sourceUrl) sourceUrl = path;
  }
  if (!sourceUrl) return c.json({ error: "invalid", message: "A source link or document is required" }, 400);

  const rows = Object.entries(body.prices)
    .filter(([, value]) => value != null && value !== ("" as unknown) && Number.isFinite(Number(value)))
    .map(([code, value]) => ({
      product_code: code,
      effective_date: body.effective_date,
      price_jmd: Number(value),
    }));
  try {
    const written = await writeRefinerySnapshot(db, refinery.id, rows, {
      source: "manual",
      sourceUrl,
      trigger: "manual_entry",
      actor: auth.id,
      mode: "latest",
      reason: body.reason,
      enteredBy: auth.id,
    });
    if (written.error) return c.json(jsonError(written.error), 400);
    await markEngineStale(db);
    return c.json({ ok: true, run: written });
  } catch (e) {
    return c.json(jsonError(e instanceof Error ? e.message : "Save failed"), 400);
  }
});

app.post("/admin/refineries/:slug/sync", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!dominionCan(auth.role, "catalog.write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => ({})) as { mode?: PetrojamSyncMode; year?: number; month?: number };
  const mode = body.mode || "latest";
  if (!["latest", "year", "month", "all"].includes(mode)) return c.json({ error: "invalid_mode" }, 400);
  const db = svc();
  const refinery = await readRefinery(db, c.req.param("slug"));
  if (!refinery) return c.json({ error: "not_found" }, 404);
  const run = await syncOneRefinery(db, refinery, {
    mode,
    year: body.year,
    month: body.month,
    trigger: "owner",
    actor: auth.id,
  });
  if (!run.error) await markEngineStale(db);
  const status = run.error ? 500 : 200;
  return c.json({ ok: !run.error, run }, status);
});

app.patch("/admin/refinery-products/:code", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!dominionCan(auth.role, "catalog.write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => ({})) as { label?: string; unit?: string };
  const { data, error } = await svc().rpc("refinery_patch_product", {
    p_code: c.req.param("code"),
    p_label: body.label ?? null,
    p_unit: body.unit === undefined ? null : body.unit,
  });
  if (error) return c.json(jsonError(error.message), 400);
  return c.json({ product: data });
});

app.post("/cron/sync-latest", async (c) => {
  const authHeader = c.req.header("Authorization") || "";
  const cronSecret = (Deno.env.get("CRON_SECRET") || Deno.env.get("FLEET_CRON_SECRET") || "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const headerCron = (c.req.header("x-fleet-cron-secret") || c.req.header("x-cron-secret") || "").trim();

  const decodeRole = (jwt: string): string => {
    try {
      const part = jwt.split(".")[1];
      if (!part) return "";
      const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(json) as { role?: string };
      return typeof payload.role === "string" ? payload.role : "";
    } catch {
      return "";
    }
  };

  const verifyLegacyServiceRoleJwt = async (jwt: string): Promise<boolean> => {
    if (decodeRole(jwt) !== "service_role") return false;
    const url = (Deno.env.get("SUPABASE_URL") || "").trim();
    if (!url) return false;
    try {
      const client = createClient(url, jwt, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
      return !error;
    } catch {
      return false;
    }
  };

  const serviceMatch = !!token && !!serviceKey && token === serviceKey;
  const cronMatch = !!cronSecret && (token === cronSecret || headerCron === cronSecret);
  let legacyJwtOk = false;
  if (!serviceMatch && !cronMatch && token.startsWith("eyJ") && decodeRole(token) === "service_role") {
    legacyJwtOk = await verifyLegacyServiceRoleJwt(token);
  }
  if (!serviceKey && !cronSecret) return c.json({ error: "server_misconfigured" }, 500);
  if (!(serviceMatch || cronMatch || legacyJwtOk)) return c.json({ error: "unauthorized" }, 401);

  try {
    const db = svc();
    const { status, runs } = await syncActiveRefineries(db, { mode: "latest", trigger: "schedule" });
    if (status === 200) await markEngineStale(db);
    logLine({ event: status === 200 ? "cron_sync_ok" : "cron_sync_error", runs });
    return c.json({ ok: status === 200, runs }, status);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    logLine({ event: "cron_sync_failed", error: message });
    return c.json({ ok: false, error: message, runs: [] }, 500);
  }
});

Deno.serve(app.fetch);
