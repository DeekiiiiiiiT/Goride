/**
 * Petrojam wholesale prices — Dominion Fuel Management → Prices
 * Sync latest page, year, month, or full archive from petrojam.com/price/
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import {
  fetchPetrojamPrices,
  PETROJAM_PRICE_URL,
  type PetrojamFetchResult,
  type PetrojamPriceRow,
  type PetrojamSyncMode,
} from "./scrape.ts";

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

const ADMIN_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

function rowToApi(r: Record<string, unknown>) {
  return {
    id: r.id,
    priceDate: r.price_date,
    gasolene87: r.gasolene_87 != null ? Number(r.gasolene_87) : null,
    gasolene90: r.gasolene_90 != null ? Number(r.gasolene_90) : null,
    autoDiesel: r.auto_diesel != null ? Number(r.auto_diesel) : null,
    kerosene: r.kerosene != null ? Number(r.kerosene) : null,
    propane: r.propane != null ? Number(r.propane) : null,
    butane: r.butane != null ? Number(r.butane) : null,
    hfo: r.hfo != null ? Number(r.hfo) : null,
    asphalt: r.asphalt != null ? Number(r.asphalt) : null,
    ulsd: r.ulsd != null ? Number(r.ulsd) : null,
    sourceUrl: r.source_url,
    scrapedAt: r.scraped_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toDbRow(row: PetrojamPriceRow, scrapedAt: string) {
  return {
    price_date: row.priceDate,
    gasolene_87: row.gasolene87,
    gasolene_90: row.gasolene90,
    auto_diesel: row.autoDiesel,
    kerosene: row.kerosene,
    propane: row.propane,
    butane: row.butane,
    hfo: row.hfo,
    asphalt: row.asphalt,
    ulsd: row.ulsd,
    source_url: PETROJAM_PRICE_URL,
    scraped_at: scrapedAt,
    updated_at: scrapedAt,
  };
}

async function upsertScraped(
  scraped: PetrojamPriceRow[],
  scrapedAt: string,
): Promise<{ inserted: number; updated: number }> {
  const db = svc();
  const dates = scraped.map((r) => r.priceDate);

  // Chunk existing lookups / upserts for large archive syncs
  const existingSet = new Set<string>();
  for (let i = 0; i < dates.length; i += 200) {
    const slice = dates.slice(i, i + 200);
    const { data: existing, error: existingErr } = await db
      .from("fuel_petrojam_prices")
      .select("price_date")
      .in("price_date", slice);
    if (existingErr) throw new Error(existingErr.message);
    for (const r of existing ?? []) {
      existingSet.add((r as { price_date: string }).price_date);
    }
  }

  const payload = scraped.map((r) => toDbRow(r, scrapedAt));
  for (let i = 0; i < payload.length; i += 100) {
    const slice = payload.slice(i, i + 100);
    const { error: upsertErr } = await db.from("fuel_petrojam_prices").upsert(slice, {
      onConflict: "price_date",
    });
    if (upsertErr) throw new Error(upsertErr.message);
  }

  let inserted = 0;
  let updated = 0;
  for (const d of dates) {
    if (existingSet.has(d)) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated };
}

app.get("/health", (c) => {
  return c.json({
    service: "petrojam-prices",
    status: "ok",
    source: PETROJAM_PRICE_URL,
    syncModes: ["latest", "year", "month", "all"],
  });
});

app.get("/admin/prices", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const limitRaw = Number(c.req.query("limit") || 104);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 104;
  const yearRaw = c.req.query("year");
  const monthRaw = c.req.query("month");
  const year = yearRaw ? Number(yearRaw) : null;
  const month = monthRaw ? Number(monthRaw) : null;

  const db = svc();
  let q = db.from("fuel_petrojam_prices").select("*").order("price_date", { ascending: false }).limit(limit);

  if (year && Number.isFinite(year)) {
    if (month && month >= 1 && month <= 12) {
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("price_date", monthStart).lte("price_date", monthEnd);
    } else {
      q = q.gte("price_date", `${year}-01-01`).lte("price_date", `${year}-12-31`);
    }
  }

  const { data, error } = await q;

  if (error) {
    logLine({ event: "list_failed", error: error.message });
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({
    prices: (data ?? []).map((r) => rowToApi(r as Record<string, unknown>)),
  });
});

app.post("/admin/sync", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden", message: "Platform owner required to sync prices" }, 403);
  }

  const body = await c.req.json().catch(() => ({})) as {
    mode?: PetrojamSyncMode;
    year?: number;
    month?: number;
    maxPages?: number;
  };

  const mode: PetrojamSyncMode = body.mode || "latest";
  if (!["latest", "year", "month", "all"].includes(mode)) {
    return c.json({ error: "invalid_mode", message: "mode must be latest|year|month|all" }, 400);
  }

  let fetched: PetrojamFetchResult;
  try {
    fetched = await fetchPetrojamPrices({
      mode,
      year: body.year != null ? Number(body.year) : undefined,
      month: body.month != null ? Number(body.month) : undefined,
      maxPages: body.maxPages != null ? Number(body.maxPages) : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    logLine({ event: "scrape_failed", mode, error: message });
    return c.json({ error: "scrape_failed", message }, 502);
  }

  const scrapedAt = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  try {
    const result = await upsertScraped(fetched.rows, scrapedAt);
    inserted = result.inserted;
    updated = result.updated;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upsert failed";
    logLine({ event: "upsert_failed", error: message });
    return c.json({ error: "sync_failed", message }, 500);
  }

  const dates = fetched.rows.map((r) => r.priceDate).sort();
  const latestDate = dates.at(-1) ?? null;
  const oldestDate = dates[0] ?? null;

  logLine({
    event: "sync_ok",
    userId: auth.id,
    mode,
    year: body.year,
    month: body.month,
    inserted,
    updated,
    latestDate,
    oldestDate,
    pagesFetched: fetched.pagesFetched,
    rowCount: fetched.rows.length,
  });

  return c.json({
    ok: true,
    mode,
    year: fetched.year ?? body.year ?? null,
    month: fetched.month ?? body.month ?? null,
    inserted,
    updated,
    latestDate,
    oldestDate,
    pagesFetched: fetched.pagesFetched,
    rowCount: fetched.rows.length,
    scrapedAt,
  });
});

/** Weekly cron / CI: sync latest page using service role or CRON_SECRET. */
app.post("/cron/sync-latest", async (c) => {
  const authHeader = c.req.header("Authorization") || "";
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const ok =
    (cronSecret && token === cronSecret) ||
    (serviceKey && token === serviceKey);
  if (!ok) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let fetched: PetrojamFetchResult;
  try {
    fetched = await fetchPetrojamPrices({ mode: "latest" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    logLine({ event: "cron_scrape_failed", error: message });
    return c.json({ error: "scrape_failed", message }, 502);
  }

  const scrapedAt = new Date().toISOString();
  try {
    const { inserted, updated } = await upsertScraped(fetched.rows, scrapedAt);
    const dates = fetched.rows.map((r) => r.priceDate).sort();
    logLine({
      event: "cron_sync_ok",
      inserted,
      updated,
      latestDate: dates.at(-1) ?? null,
      rowCount: fetched.rows.length,
    });
    return c.json({
      ok: true,
      mode: "latest",
      inserted,
      updated,
      latestDate: dates.at(-1) ?? null,
      rowCount: fetched.rows.length,
      scrapedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upsert failed";
    return c.json({ error: "sync_failed", message }, 500);
  }
});

Deno.serve(app.fetch);
