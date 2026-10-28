import { Hono } from "npm:hono@4.3.11";
import { cors } from "npm:hono@4.3.11/cors";
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { assessFillPlausibility } from "../../../packages/fuel-core/src/fillPlausibility.ts";
import { findMatchingStationSmart, type StationProfile } from "../../../packages/location/src/stationMatch.ts";
import OpenAI from "npm:openai";
import { dataUrlFromFile, odometerVisionBody, parseOdometerVision } from "../_shared/odometerVision.ts";
import {
  contributorLevel,
  decidePlugStation,
  hashExplorerUser,
  impossibleTravel,
  fillCare,
  mayJoinPlug,
  planPlugFill,
  plugPriceDecision,
  placeTypeForKind,
  suggestReview,
  validatePlaceDraft,
  writesTouchFleetMoney,
  PLUG_FLAGS,
  sectionEnabled,
} from "../_shared/plugCore.ts";
import { registerPlaceAdmin } from "./place_admin.ts";

const app = new Hono().basePath("/explorer");
app.use("*", cors());

function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key);
}

async function userFrom(c: { req: { header: (name: string) => string | undefined } }): Promise<User> {
  const header = c.req.header("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in required");
  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in required");
  return data.user;
}

function roleOf(user: User): string {
  const appMeta = user.app_metadata || {};
  const explicit = appMeta.role;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const roles = appMeta.roles;
  if (Array.isArray(roles)) {
    const first = roles.find((role) => typeof role === "string" && role.trim());
    if (typeof first === "string") return first.trim();
  }
  return "";
}

function userPepper(): string {
  const pepper = Deno.env.get("PLUG_USER_HASH_PEPPER")?.trim() || "";
  if (!pepper) throw new Error("PLUG_USER_HASH_PEPPER is not set");
  return pepper;
}

const PLUG_REFUSAL = "This account can't use Plug yet";

async function hasPlugMembership(userId: string): Promise<boolean> {
  const sb = admin();
  const { data, error } = await sb.schema("explorer").from("profile").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.user_id);
}

async function requireExplorer(c: { req: { header: (name: string) => string | undefined } }): Promise<User> {
  const user = await userFrom(c);
  const role = roleOf(user);
  if (role === "explorer_user" || role === "platform_owner") return user;
  if (await hasPlugMembership(user.id)) return user;
  throw new Error(PLUG_REFUSAL);
}

async function requireOwner(c: { req: { header: (name: string) => string | undefined } }): Promise<User> {
  const user = await userFrom(c);
  if (roleOf(user) !== "platform_owner") throw new Error("Only the owner can review places");
  return user;
}

async function ensureProfile(sb: SupabaseClient, user: User): Promise<string | null> {
  const meta = user.user_metadata || {};
  const googleName = typeof meta.full_name === "string" ? meta.full_name.trim() : typeof meta.name === "string" ? meta.name.trim() : "";
  const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  const seed = metaName || googleName || null;
  const { error: upsertError } = await sb.schema("explorer").from("profile").upsert({
    user_id: user.id,
    phone: user.phone || null,
    email: user.email || null,
  }, { onConflict: "user_id" });
  if (upsertError) throw upsertError;
  if (seed) {
    const { error: seedError } = await sb.schema("explorer").from("profile").update({ display_name: seed }).eq("user_id", user.id).is("display_name", null);
    if (seedError) throw seedError;
  }
  const { data, error } = await sb.schema("explorer").from("profile").select("display_name").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  const saved = typeof data?.display_name === "string" ? data.display_name.trim() : "";
  return saved || null;
}

async function allow(sb: SupabaseClient, userId: string, flag: string): Promise<boolean> {
  const { data: globalFlag } = await sb.from("platform_feature_flags").select("enabled").eq("name", flag).maybeSingle();
  const { data: row } = await sb.schema("explorer").from("flag_allowlist").select("user_id").eq("flag_name", flag).eq("user_id", userId).maybeSingle();
  return sectionEnabled(flag as typeof PLUG_FLAGS[number], Boolean(globalFlag?.enabled), Boolean(row));
}

type FillCare = { kmPerLitre: number | null; dueOn: string | null; status: string; pace: number | null };

async function careFor(sb: SupabaseClient, userId: string, vehicleId: string, litres: number | null): Promise<FillCare> {
  const [{ data: readings }, { data: services }] = await Promise.all([
    sb.schema("explorer").from("odometer_reading").select("reading, recorded_at").eq("user_id", userId).eq("vehicle_id", vehicleId).order("recorded_at"),
    sb.schema("explorer").from("service_log").select("done_on, odometer").eq("user_id", userId).eq("vehicle_id", vehicleId).order("done_on", { ascending: false }).limit(1),
  ]);
  const lastService = services?.[0] as { done_on?: string; odometer?: number | null } | undefined;
  return fillCare({
    readings: (readings || []).map((row: { reading: number; recorded_at: string }) => ({ at: row.recorded_at, km: Number(row.reading) })),
    litres,
    lastServiceOn: lastService?.done_on || null,
    lastServiceKm: lastService?.odometer == null ? null : Number(lastService.odometer),
    now: new Date().toISOString(),
  });
}

async function notifyPlugUser(sb: SupabaseClient, userId: string, title: string, body: string) {
  await sb.schema("explorer").from("notification").insert({ user_id: userId, title, body });
  const { data: subs } = await sb.schema("explorer").from("push_subscription").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subs?.length || !publicKey || !privateKey) return;
  const webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:support@roam.app", publicKey, privateKey);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url: "/#/inbox" }),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sb.schema("explorer").from("push_subscription").delete().eq("id", sub.id);
      }
    }
  }
}

async function syncServiceReminder(sb: SupabaseClient, userId: string, vehicleId: string, care: FillCare) {
  const dueOn = care.dueOn ? care.dueOn.slice(0, 10) : null;
  const { data: existing } = await sb.schema("explorer").from("reminder").select("id, notified_at, due_on").eq("user_id", userId).eq("vehicle_id", vehicleId).eq("kind", "service").order("created_at", { ascending: false }).limit(1);
  const row = existing?.[0] as { id: string; notified_at: string | null; due_on: string | null } | undefined;
  const previousDue = row?.due_on ? String(row.due_on).slice(0, 10) : null;
  const dayMoved = Boolean(dueOn) && dueOn !== previousDue;
  const dueNow = care.status === "due_soon" || care.status === "overdue";
  const shouldAlertDue = dueNow && !row?.notified_at;
  const shouldNotify = shouldAlertDue || (dayMoved && !dueNow);
  const notifiedAt = shouldAlertDue ? new Date().toISOString() : dueNow ? row?.notified_at || null : null;
  if (row) {
    await sb.schema("explorer").from("reminder").update({ due_on: dueOn, notified_at: notifiedAt }).eq("id", row.id);
  } else {
    await sb.schema("explorer").from("reminder").insert({
      user_id: userId,
      vehicle_id: vehicleId,
      kind: "service",
      due_on: dueOn,
      notified_at: notifiedAt,
    });
  }
  if (shouldNotify && dueOn) {
    const title = shouldAlertDue ? "Service is coming due" : "Next service moved";
    await notifyPlugUser(sb, userId, title, `Next service ${dueOn}.`);
  }
}

async function hitLimit(sb: SupabaseClient, userId: string, action: string, max: number): Promise<boolean> {
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  const key = { user_id: userId, action, window_start: windowStart.toISOString() };
  const { data } = await sb.schema("explorer").from("write_window").select("hits").match(key).maybeSingle();
  const hits = Number(data?.hits || 0) + 1;
  if (hits > max) return false;
  await sb.schema("explorer").from("write_window").upsert({ ...key, hits });
  return true;
}

app.get("/places/taxonomy", async (c) => {
  try {
    const sb = admin();
    const { data, error } = await sb.schema("places").rpc("taxonomy");
    if (error) throw error;
    return c.json(data || {});
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load categories" }, 400);
  }
});

app.get("/health", (c) => c.json({ service: "explorer", status: "ok" }));

app.post("/join", async (c) => {
  try {
    const user = await userFrom(c);
    if (!mayJoinPlug(roleOf(user))) return c.json({ error: PLUG_REFUSAL }, 403);
    const sb = admin();
    const displayName = await ensureProfile(sb, user);
    return c.json({ ok: true, displayName });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not open Roam Plug" }, 400);
  }
});

app.post("/odometer-scan", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "File upload required" }, 400);
    // Refuse before any paid read. A missing key must not count as a scan.
    if (file.size > 5 * 1024 * 1024) return c.json({ error: "That photo is too large. Type the reading." }, 413);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "Odometer reading is not available right now" }, 503);
    const sb = admin();
    await ensureProfile(sb, user);
    if (!(await hitLimit(sb, user.id, "scan", 30))) return c.json({ error: "Too many scans this hour" }, 429);
    const openai = new OpenAI({ apiKey });
    const dataUrl = await dataUrlFromFile(file);
    const response = await openai.chat.completions.create(odometerVisionBody(dataUrl));
    return c.json(parseOdometerVision(response.choices[0]?.message?.content || "{}"));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not read the odometer" }, 400);
  }
});

app.get("/flags", async (c) => {
  try {
    const sb = admin();
    const header = c.req.header("Authorization") || "";
    let userId = "";
    if (header) {
      try {
        userId = (await userFrom(c)).id;
      } catch {
        userId = "";
      }
    }
    const flags: Record<string, boolean> = {};
    for (const flag of PLUG_FLAGS) {
      if (userId) {
        flags[flag] = await allow(sb, userId, flag);
      } else {
        const { data: globalFlag } = await sb.from("platform_feature_flags").select("enabled").eq("name", flag).maybeSingle();
        flags[flag] = Boolean(globalFlag?.enabled);
      }
    }
    return c.json({ flags });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load flags" }, 400);
  }
});

app.get("/care", async (c) => {
  try {
    const user = await requireExplorer(c);
    const vehicleId = c.req.query("vehicleId") || "";
    const sb = admin();
    const { data: vehicle } = await sb.schema("explorer").from("user_vehicle").select("id").eq("id", vehicleId).eq("user_id", user.id).maybeSingle();
    if (!vehicle) return c.json({ error: "That vehicle is not in your garage" }, 404);
    const { data: lastFill } = await sb.schema("explorer").from("fuel_log").select("litres").eq("user_id", user.id).eq("vehicle_id", vehicleId).order("created_at", { ascending: false }).limit(1);
    const litres = lastFill?.[0]?.litres == null ? null : Number(lastFill[0].litres);
    return c.json(await careFor(sb, user.id, vehicleId, litres));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load service" }, 400);
  }
});

app.get("/push/public-key", async (c) => {
  try {
    await requireExplorer(c);
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim() || "";
    if (!publicKey) return c.json({ error: "Push is not set up yet. The inbox still works." }, 404);
    return c.json({ publicKey });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load push" }, 401);
  }
});

app.post("/push-subscriptions", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    if (!body.endpoint || !body.p256dh || !body.auth) return c.json({ error: "That push subscription is incomplete" }, 400);
    const sb = admin();
    await ensureProfile(sb, user);
    const { error } = await sb.schema("explorer").from("push_subscription").upsert({
      user_id: user.id,
      endpoint: String(body.endpoint),
      p256dh: String(body.p256dh),
      auth: String(body.auth),
    }, { onConflict: "user_id,endpoint" });
    if (error) throw error;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not save push" }, 400);
  }
});

app.post("/profile", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const sb = admin();
    await sb.schema("explorer").from("profile").upsert({
      user_id: user.id,
      display_name: body.displayName || user.user_metadata?.full_name || user.user_metadata?.name || null,
      phone: user.phone || body.phone || null,
      email: user.email || null,
      parish_pcode: body.parishPcode || null,
      consent_at: body.consent ? new Date().toISOString() : null,
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not save profile" }, 400);
  }
});

app.get("/garage", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const { data, error } = await sb.schema("explorer").from("user_vehicle").select("*").eq("user_id", user.id).order("created_at");
    if (error) throw error;
    return c.json({ vehicles: data || [] });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load garage" }, 400);
  }
});

app.post("/vehicles", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const sb = admin();
    await ensureProfile(sb, user);
    if (!(await allow(sb, user.id, "plug.garage"))) return c.json({ error: "Garage is turned off" }, 403);
    let pendingId: string | null = null;
    if (!body.catalogVariantId) {
      const { data: pending, error } = await sb.schema("explorer").from("pending_catalog_request").insert({
        user_id: user.id,
        make: body.make || "Unknown",
        model: body.model || null,
        year: body.year || null,
        note: body.note || null,
      }).select("id").single();
      if (error) throw error;
      pendingId = pending.id;
    }
    const { data, error } = await sb.schema("explorer").from("user_vehicle").insert({
      user_id: user.id,
      catalog_variant_id: body.catalogVariantId || null,
      pending_request_id: pendingId,
      year: body.year || null,
      nickname: body.nickname || null,
      starting_odometer: body.startingOdometer ?? null,
    }).select("*").single();
    if (error) throw error;
    if (body.startingOdometer != null) {
      await sb.schema("explorer").from("odometer_reading").insert({
        user_id: user.id,
        vehicle_id: data.id,
        reading: body.startingOdometer,
        source: "start",
      });
    }
    return c.json({ vehicle: data });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not add vehicle" }, 400);
  }
});

app.post("/fuel-logs", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const sb = admin();
    await ensureProfile(sb, user);
    if (!(await allow(sb, user.id, "plug.fuel_log"))) return c.json({ error: "Fuel logging is turned off" }, 403);
    if (!(await hitLimit(sb, user.id, "fuel", 30))) return c.json({ error: "Too many fuel logs this hour" }, 429);

    const { data: vehicle } = await sb.schema("explorer").from("user_vehicle").select("id").eq("id", body.vehicleId).eq("user_id", user.id).maybeSingle();
    if (!vehicle) return c.json({ error: "That vehicle is not in your garage" }, 404);

    const { data: last } = await sb.schema("explorer").from("odometer_reading").select("reading").eq("vehicle_id", body.vehicleId).order("recorded_at", { ascending: false }).limit(1);
    const previous = Number(last?.[0]?.reading);
    const issues = assessFillPlausibility({
      amount: Number(body.amount),
      liters: Number(body.litres),
      odometer: Number(body.odometer),
      previousOdometer: Number.isFinite(previous) ? previous : null,
      confirmed: Boolean(body.confirmed),
    });
    const blocking = issues.filter((issue) => issue.severity === "block" || (issue.severity === "confirm" && !body.confirmed));
    if (blocking.length) return c.json({ error: blocking[0]!.message, issues }, 422);

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const { data: prior } = await sb.schema("explorer").from("fuel_log").select("lat,lng,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
    const prevPin = prior?.[0] as { lat?: number; lng?: number; created_at?: string } | undefined;
    if (prevPin?.lat && prevPin.lng && Number.isFinite(lat) && Number.isFinite(lng)) {
      if (impossibleTravel(
        { lat: prevPin.lat, lng: prevPin.lng, at: prevPin.created_at || new Date().toISOString() },
        { lat, lng, at: new Date().toISOString() },
      )) {
        return c.json({ error: "That pin is too far from your last fuel-up to be the same trip" }, 422);
      }
    }

    const { data: stationRows, error: stationError } = await sb.schema("places").rpc("station_match_candidates");
    if (stationError) throw stationError;
    const stations: StationProfile[] = (stationRows || []).map((row: { id: string; name: string | null; payload_json: Record<string, unknown> | null }) => {
      const payload = (row.payload_json || {}) as Record<string, unknown>;
      const location = (payload.location || {}) as { lat?: number; lng?: number };
      const status = (payload.status as StationProfile["status"]) || "verified";
      return {
        id: String(row.id),
        name: String(row.name || payload.name || "Station"),
        brand: String(payload.brand || ""),
        address: String(payload.address || ""),
        location: { lat: Number(location.lat ?? payload.lat), lng: Number(location.lng ?? payload.lng) },
        status,
        geofenceRadius: Number(payload.geofenceRadius) || undefined,
        pinConfirmed: status === "learnt" ? undefined : payload.pinConfirmed !== false,
        gpsAliases: Array.isArray(payload.gpsAliases) ? payload.gpsAliases as StationProfile["gpsAliases"] : undefined,
      };
    }).filter((station) => (station.status === "verified" || station.status === "learnt") && Number.isFinite(station.location.lat) && Number.isFinite(station.location.lng));

    const mocked = Boolean(body.mockLocation);
    const match = Number.isFinite(lat) && Number.isFinite(lng)
      ? findMatchingStationSmart(lat, lng, stations, 600, Number(body.accuracyM) || 0)
      : { confidence: "none" as const, station: null, distance: Infinity, candidatesInRange: 0, secondClosestDistance: Infinity };
    let decision = decidePlugStation(match);
    if (mocked && decision === "learnt") decision = "review";
    const pricePer = Number(body.litres) > 0 ? Number(body.amount) / Number(body.litres) : 0;
    const estimate = await retailEstimate(sb, String(body.grade || "e10_87"));
    const priceCall = mocked ? "hold" : estimate ? plugPriceDecision(pricePer, estimate) : "hold";
    const writes = planPlugFill({ decision, price: priceCall });
    const touched = writesTouchFleetMoney(writes.map((write) => write.table));
    if (touched.length) throw new Error("Plug fill tried to touch fleet money");
    let stationId = decision === "confirm" || (decision === "review" && match.station) ? match.station?.id || null : null;
    if (!mocked && decision === "learnt" && Number.isFinite(lat) && Number.isFinite(lng)) {
      const id = crypto.randomUUID();
      const { error } = await sb.schema("places").rpc("insert_plug_learnt_station", {
        p_id: id,
        p_name: body.stationName || "Unconfirmed station",
        p_lat: lat,
        p_lng: lng,
        p_brand: body.brand || null,
      });
      if (error) throw error;
      stationId = id;
    }

    const userHash = await hashExplorerUser(user.id, userPepper());
    const clientId = String(body.clientId || crypto.randomUUID());
    const { data: log, error: logError } = await sb.schema("explorer").from("fuel_log").insert({
      user_id: user.id,
      vehicle_id: body.vehicleId,
      litres: body.litres,
      amount: body.amount,
      price_per_litre: pricePer,
      grade: body.grade || null,
      odometer: body.odometer,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      accuracy_m: body.accuracyM ?? null,
      mock_location: Boolean(body.mockLocation),
      station_id: stationId,
      client_id: clientId,
    }).select("id, created_at").single();
    if (logError) throw logError;

    await sb.schema("explorer").from("odometer_reading").insert({
      user_id: user.id,
      vehicle_id: body.vehicleId,
      reading: body.odometer,
      source: "fuel",
      reference_id: log.id,
    });
    if (stationId || mocked) {
      const { error: evidenceError } = await sb.schema("places").from("place_evidence").insert({
        station_id: stationId,
        user_hash: userHash,
        origin_app: "roam_plug",
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        accuracy_m: body.accuracyM ?? null,
        mock_location: mocked,
      });
      if (evidenceError) throw evidenceError;
    }
    let priceUpdated = false;
    if (stationId && pricePer > 0) {
      const grade = body.grade || "e10_87";
      await sb.schema("places").from("price_observation").insert({
        station_id: stationId,
        place_id: stationId,
        grade,
        price_per_litre: pricePer,
        origin_app: "roam_plug",
        user_hash: userHash,
        in_band: priceCall === "publish",
      });
      if (!mocked && priceCall === "publish" && decision === "confirm") {
        await sb.schema("places").from("price_current").upsert({
          station_id: stationId,
          place_id: stationId,
          grade,
          price_per_litre: pricePer,
          observed_at: new Date().toISOString(),
        });
        const { data: card } = await sb.schema("places").from("public_place").select("prices").eq("id", stationId).maybeSingle();
        priceUpdated = Boolean(card);
      }
    }
    const care = await careFor(sb, user.id, body.vehicleId, Number(body.litres));
    await syncServiceReminder(sb, user.id, body.vehicleId, care);
    return c.json({
      id: log.id,
      createdAt: log.created_at,
      stationId,
      decision,
      price: priceCall,
      odometer: Number(body.odometer),
      kmPerLitre: care.kmPerLitre,
      nextServiceOn: care.dueOn,
      serviceStatus: care.status,
      priceUpdated,
      locationUsed: Number.isFinite(lat) && Number.isFinite(lng),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not save fuel log" }, 400);
  }
});

app.post("/services", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const sb = admin();
    const { data, error } = await sb.schema("explorer").from("service_log").insert({
      user_id: user.id,
      vehicle_id: body.vehicleId,
      op_code: body.opCode,
      odometer: body.odometer ?? null,
      done_on: body.doneOn,
      done_elsewhere: Boolean(body.doneElsewhere),
    }).select("id").single();
    if (error) throw error;
    if (body.odometer != null) {
      await sb.schema("explorer").from("odometer_reading").insert({
        user_id: user.id,
        vehicle_id: body.vehicleId,
        reading: body.odometer,
        source: "service",
        reference_id: data.id,
      });
    }
    const care = await careFor(sb, user.id, body.vehicleId, null);
    await syncServiceReminder(sb, user.id, body.vehicleId, care);
    return c.json({ id: data.id, nextServiceOn: care.dueOn, serviceStatus: care.status });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not log service" }, 400);
  }
});

app.post("/reminders", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const sb = admin();
    const { data, error } = await sb.schema("explorer").from("reminder").insert({
      user_id: user.id,
      vehicle_id: body.vehicleId || null,
      kind: body.kind,
      due_on: body.dueOn || null,
      due_km: body.dueKm ?? null,
    }).select("*").single();
    if (error) throw error;
    return c.json({ reminder: data });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not save reminder" }, 400);
  }
});

function jpegBytes(value: unknown): { bytes: Uint8Array } | { error: string } | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { error: "That photo could not be saved." };
  const cleaned = value.replace(/^data:image\/jpeg;base64,/, "").replace(/\s/g, "");
  if (cleaned.length > 2_000_000) return { error: "That photo is too large." };
  let bin = "";
  try {
    bin = atob(cleaned);
  } catch {
    return { error: "That photo could not be saved." };
  }
  if (bin.length > 1_500_000) return { error: "That photo is too large." };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { error: "That photo could not be saved." };
  return { bytes };
}

app.post("/pins", async (c) => {
  try {
    const user = await requireExplorer(c);
    const body = await c.req.json();
    const draft = validatePlaceDraft({ name: body.name, kind: body.kind });
    if (!draft.ok) return c.json({ error: draft.error }, 422);
    const sb = admin();
    await ensureProfile(sb, user);
    if (!(await allow(sb, user.id, "plug.map_it"))) return c.json({ error: "Map It is turned off" }, 403);
    if (!(await hitLimit(sb, user.id, "pin", 20))) return c.json({ error: "Too many pins this hour" }, 429);
    const accuracy = Number(body.accuracyM);
    if (!(accuracy > 0) || accuracy > 100) return c.json({ error: "GPS is not accurate enough to pin this place" }, 422);
    const photo = jpegBytes(body.photo);
    if (photo && "error" in photo) return c.json({ error: photo.error }, 422);
    const userHash = await hashExplorerUser(user.id, userPepper());
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const services = Array.isArray(body.services) ? body.services.map((item: unknown) => String(item).slice(0, 40)).slice(0, 20) : [];
    const hours = typeof body.hours === "string" ? body.hours.slice(0, 80) : null;
    const phone = typeof body.phone === "string" ? body.phone.slice(0, 40) : null;
    const brand = draft.kind === "fuel" && typeof body.brand === "string" ? body.brand.slice(0, 80) : null;
    if (body.mockLocation) {
      await sb.schema("places").from("place_evidence").insert({
        user_hash: userHash,
        origin_app: "roam_plug",
        lat,
        lng,
        accuracy_m: accuracy,
        mock_location: true,
        note: "Held for review",
      });
      return c.json({ status: "held", suggestion: "Held for review", photo: false });
    }
    const placeType = placeTypeForKind(draft.kind);
    if (!placeType) return c.json({ error: "Choose a place type." }, 422);
    const { data: nearby, error: nearbyError } = await sb.schema("places").rpc("nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: 2000,
      p_statuses: ["verified"],
    });
    if (nearbyError) throw nearbyError;
    const hit = (nearby || []).find((place: { place_type?: string; distance_m?: number; effective_geofence_m?: number }) =>
      place.place_type === placeType && Number(place.distance_m) <= Number(place.effective_geofence_m || 50)
    );
    let placeId = hit?.id as string | undefined;
    if (!placeId) {
      const { data: parish } = await sb.schema("places").rpc("parish_pcode", { lat, lng });
      let brandId: string | null = null;
      if (brand) {
        const { data: brands } = await sb.schema("places").from("brand").select("id,name,aliases");
        const match = (brands || []).find((item: { name?: string; aliases?: string[] }) => {
          const wanted = brand.toLowerCase();
          return item.name?.toLowerCase() === wanted || (item.aliases || []).some((alias) => alias.toLowerCase() === wanted);
        });
        brandId = match?.id || null;
      }
      const { data: created, error } = await sb.schema("places").from("place").insert({
        name: draft.name,
        brand_id: brandId,
        place_type: placeType,
        lat,
        lng,
        pcode: typeof parish === "string" ? parish : null,
        status: "pending",
        pin_state: "unchecked",
        origin_app: "roam_plug",
        attributes: { services, hours, phone, ...(brand && !brandId ? { brand_text: brand } : {}) },
      }).select("id").single();
      if (error) throw error;
      placeId = created.id;
      const { data: typeRow } = await sb.schema("places").from("place_type").select("default_facilities").eq("slug", placeType).maybeSingle();
      const facilities = Array.isArray(typeRow?.default_facilities) ? typeRow.default_facilities : [];
      if (facilities.length) {
        const { error: facilityError } = await sb.schema("places").from("place_facility").insert(
          facilities.map((facility: string) => ({
            place_id: placeId,
            facility_type: facility,
            source: "plug_proposal",
            attributes: {},
          })),
        );
        if (facilityError) throw facilityError;
      }
    }
    let photoPath: string | null = null;
    if (photo && "bytes" in photo) {
      photoPath = `${placeId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await sb.storage.from("explorer-photos").upload(photoPath, photo.bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (uploadError) photoPath = null;
    }
    await sb.schema("places").from("place_evidence").insert({
      place_id: placeId,
      user_hash: userHash,
      origin_app: "roam_plug",
      lat,
      lng,
      accuracy_m: accuracy,
      mock_location: false,
      photo_path: photoPath,
      note: null,
    });
    const { count } = await sb.schema("places").from("place_evidence").select("user_hash", { count: "exact", head: true }).eq("place_id", placeId);
    const suggestion = suggestReview({
      distinctUsers: count || 1,
      bestAccuracyM: accuracy,
      nearbyVerifiedName: hit?.name || null,
    });
    await sb.schema("places").from("place_change_proposal").insert({
      place_id: placeId,
      kind: hit ? "merge" : "new",
      payload: {
        name: draft.name,
        kind: draft.kind,
        lat,
        lng,
        accuracyM: accuracy,
        phone,
        hours,
        services,
        brand,
        photoPath,
      },
      distinct_users: count || 1,
      best_accuracy_m: accuracy,
      suggestion: suggestion.label,
    });
    await sb.schema("explorer").from("pin_receipt").upsert({ user_id: user.id, place_id: placeId }, { onConflict: "user_id,place_id" });
    return c.json({ placeId, status: "pending", suggestion: suggestion.label, photo: Boolean(photoPath) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not save pin" }, 400);
  }
});

app.get("/me/export", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const tables = ["profile", "user_vehicle", "fuel_log", "odometer_reading", "service_log", "reminder", "notification", "pin_receipt", "push_subscription"] as const;
    const dump: Record<string, unknown> = {};
    for (const table of tables) {
      const { data } = await sb.schema("explorer").from(table).select("*").eq(table === "profile" ? "user_id" : "user_id", user.id);
      dump[table] = data || [];
    }
    return c.json(dump);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not export" }, 400);
  }
});

app.delete("/me", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const userHash = await hashExplorerUser(user.id, userPepper());
    await sb.schema("places").from("place_evidence").delete().eq("user_hash", userHash);
    const { error } = await sb.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not delete account" }, 400);
  }
});

app.get("/notifications", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const { data, error } = await sb.schema("explorer").from("notification").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return c.json({ notifications: data || [] });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load inbox" }, 400);
  }
});

app.get("/fuel-logs", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    let query = sb.schema("explorer").from("fuel_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const vehicleId = c.req.query("vehicleId");
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    const { data, error } = await query;
    if (error) throw error;
    return c.json({ logs: data || [] });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load fuel logs" }, 400);
  }
});

app.get("/services", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    let query = sb.schema("explorer").from("service_log").select("*").eq("user_id", user.id).order("done_on", { ascending: false });
    const vehicleId = c.req.query("vehicleId");
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    const { data, error } = await query;
    if (error) throw error;
    return c.json({ services: data || [] });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load services" }, 400);
  }
});

app.get("/reminders", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    let query = sb.schema("explorer").from("reminder").select("*").eq("user_id", user.id).order("due_on");
    const vehicleId = c.req.query("vehicleId");
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    const { data, error } = await query;
    if (error) throw error;
    return c.json({ reminders: data || [] });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load reminders" }, 400);
  }
});

app.delete("/vehicles/:id", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const { data, error } = await sb.schema("explorer").from("user_vehicle").delete().eq("id", c.req.param("id")).eq("user_id", user.id).select("id");
    if (error) throw error;
    if (!data?.length) return c.json({ error: "That vehicle is not in your garage" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not remove vehicle" }, 400);
  }
});

app.post("/places/:id/facility", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const placeId = c.req.param("id");
    const body = await c.req.json();
    const facility = String(body.facility || "").trim();
    const action = body.action === "remove" ? "facility_remove" : "facility_add";
    if (!facility) return c.json({ error: "Choose a facility" }, 400);
    const { data: known } = await sb.schema("places").from("facility_type").select("slug").eq("slug", facility).maybeSingle();
    if (!known) return c.json({ error: `Unknown facility ${facility}` }, 400);
    const { error } = await sb.schema("places").from("place_change_proposal").insert({
      place_id: placeId,
      kind: action,
      payload: { facility_type: facility, label: body.label || null },
      distinct_users: 1,
      suggestion: "facility",
    });
    if (error) throw error;
    return c.json({ ok: true, by: user.id });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not suggest that facility" }, 400);
  }
});

app.post("/pins/:id/withdraw", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const placeId = c.req.param("id");
    const userHash = await hashExplorerUser(user.id, userPepper());
    const { data: mine } = await sb.schema("places").from("place_evidence").select("id").eq("place_id", placeId).eq("user_hash", userHash);
    if (!mine?.length) return c.json({ error: "That pin is not yours" }, 404);
    await sb.schema("places").from("place_evidence").delete().eq("place_id", placeId).eq("user_hash", userHash);
    const { count } = await sb.schema("places").from("place_evidence").select("id", { count: "exact", head: true }).eq("place_id", placeId);
    const { data: place } = await sb.schema("places").from("place").select("status").eq("id", placeId).maybeSingle();
    if (place?.status === "pending" && !count) {
      await sb.schema("places").from("place_change_proposal").delete().eq("place_id", placeId);
      await sb.schema("places").from("place_facility").delete().eq("place_id", placeId);
      await sb.schema("places").from("place").delete().eq("id", placeId).eq("status", "pending");
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not withdraw pin" }, 400);
  }
});

app.get("/contributions", async (c) => {
  try {
    const user = await requireExplorer(c);
    const sb = admin();
    const { data: trust } = await sb.schema("explorer").from("trust").select("*").eq("user_id", user.id).maybeSingle();
    const { data: receipts } = await sb.schema("explorer").from("pin_receipt").select("place_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    const submitted = new Map((receipts || []).map((row) => [row.place_id, row.created_at]));
    const ids = (receipts || []).map((row) => row.place_id).filter(Boolean);
    const { data: places } = ids.length
      ? await sb.schema("places").from("place").select("id, name, status, pcode, lat, lng").in("id", ids)
      : { data: [] };
    const pins = (places || []).map((place) => ({
      id: place.id,
      name: place.name,
      status: place.status,
      pcode: place.pcode,
      lat: place.lat,
      lng: place.lng,
      created_at: submitted.get(place.id) || null,
    }));
    return c.json({ level: contributorLevel(Number(trust?.approved_count || 0)), trust: trust || { score: 0, approved_count: 0, rejected_count: 0 }, pins });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load contributions" }, 400);
  }
});

app.get("/admin/places", async (c) => {
  try {
    await requireOwner(c);
    const sb = admin();
    const { data, error } = await sb.schema("places").from("place_change_proposal").select("*").eq("status", "pending").order("created_at");
    if (error) throw error;
    const items = await Promise.all((data || []).map(async (item) => {
      const payload = (item.payload || {}) as { photoPath?: string };
      let photoUrl: string | null = null;
      if (payload.photoPath) {
        const signed = await sb.storage.from("explorer-photos").createSignedUrl(payload.photoPath, 600);
        photoUrl = signed.data?.signedUrl || null;
      }
      return { ...item, payload: { ...payload, photoUrl } };
    }));
    return c.json({ items });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load queue" }, 403);
  }
});

app.post("/admin/places/:id", async (c) => {
  try {
    const owner = await requireOwner(c);
    const body = await c.req.json();
    const sb = admin();
    const id = c.req.param("id");
    const action = String(body.action || "");
    const { data: proposal } = await sb.schema("places").from("place_change_proposal").select("*").eq("id", id).single();
    if (!proposal) return c.json({ error: "That item is gone" }, 404);
    const proposalKind = String(proposal.kind || "");
    if (action === "approve" && proposalKind === "facility_add") {
      const payload = (proposal.payload || {}) as { facility_type?: string; label?: string; attributes?: Record<string, unknown> };
      if (!payload.facility_type) return c.json({ error: "That facility is missing a type" }, 400);
      const { error: addError } = await sb.schema("places").from("place_facility").insert({
        place_id: proposal.place_id,
        facility_type: payload.facility_type,
        label: payload.label || null,
        attributes: payload.attributes || {},
        source: "plug_proposal",
      });
      if (addError) throw addError;
    } else if (action === "approve" && proposalKind === "facility_remove") {
      const payload = (proposal.payload || {}) as { facility_type?: string; facility_id?: string };
      let remove = sb.schema("places").from("place_facility").delete().eq("place_id", proposal.place_id);
      remove = payload.facility_id
        ? remove.eq("id", payload.facility_id)
        : remove.eq("facility_type", payload.facility_type || "");
      const { error: removeError } = await remove;
      if (removeError) throw removeError;
    } else if (action === "approve") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const { error: verifyError } = await sb.schema("places").from("place").update({
        status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: owner.id,
        ...(name ? { name } : {}),
      }).eq("id", proposal.place_id);
      if (verifyError) throw verifyError;
    } else if (action === "reject") {
      if (proposalKind !== "facility_add" && proposalKind !== "facility_remove") {
        await sb.schema("places").from("place").update({ status: "rejected" }).eq("id", proposal.place_id);
      }
    } else if (action === "type" && body.placeType) {
      const { error: typeError } = await sb.schema("places").from("place").update({
        place_type: String(body.placeType),
      }).eq("id", proposal.place_id);
      if (typeError) throw typeError;
    } else if (action === "merge" && body.intoId) {
      await sb.schema("places").from("place_evidence").update({ place_id: body.intoId }).eq("place_id", proposal.place_id);
      await sb.schema("places").from("place").update({ status: "duplicate", duplicate_of: body.intoId }).eq("id", proposal.place_id);
    } else {
      return c.json({ error: "Choose approve, reject, or merge" }, 400);
    }
    await sb.schema("places").from("place_change_proposal").update({
      status: action === "reject" ? "rejected" : "approved",
      decided_by: owner.id,
      decided_at: new Date().toISOString(),
    }).eq("id", id);
    const note = action === "reject"
      ? { title: "Place not added", body: "Your pin was not approved." }
      : action === "merge"
      ? { title: "Pin matched", body: "Your pin was matched to a place already on the map." }
      : action === "type"
      ? { title: "Place type updated", body: "The place type was changed during review." }
      : { title: "Place approved", body: "Your pin is now on the map." };
    const { data: receipts } = await sb.schema("explorer").from("pin_receipt").select("user_id").eq("place_id", proposal.place_id);
    for (const receipt of receipts || []) {
      await notifyPlugUser(sb, receipt.user_id as string, note.title, note.body);
    }
    const { error: publishError } = await sb.schema("places").rpc("refresh_public_place", { p_place_id: proposal.place_id });
    if (publishError) throw publishError;
    const { error: coverageError } = await sb.schema("places").rpc("refresh_coverage");
    if (coverageError) throw coverageError;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not review" }, 400);
  }
});

app.get("/admin/coverage", async (c) => {
  try {
    await requireOwner(c);
    const sb = admin();
    const { data, error } = await sb.schema("places").from("coverage_count").select("*");
    if (error) throw error;
    const { count } = await sb.schema("places").from("place_change_proposal").select("id", { count: "exact", head: true }).eq("status", "pending");
    return c.json({ coverage: data || [], pending: count || 0 });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load coverage" }, 403);
  }
});

app.post("/admin/flags", async (c) => {
  try {
    const owner = await requireOwner(c);
    const body = await c.req.json();
    const sb = admin();
    if (body.userId) {
      await sb.schema("explorer").from("flag_allowlist").upsert({ flag_name: body.flag, user_id: body.userId });
    } else {
      await sb.from("platform_feature_flags").upsert({ name: body.flag, enabled: Boolean(body.enabled), updated_at: new Date().toISOString() });
    }
    return c.json({ ok: true, by: owner.id });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not update flag" }, 403);
  }
});

app.post("/demand", async (c) => {
  try {
    const body = await c.req.json();
    const sb = admin();
    await sb.schema("places").from("demand_search").insert({ variant_id: body.variantId || null, query: String(body.query || "").slice(0, 120) });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not record demand" }, 400);
  }
});

async function retailEstimate(sb: SupabaseClient, grade: string): Promise<number | null> {
  const { data, error } = await sb.schema("places").rpc("latest_retail_estimate", { p_grade: grade });
  if (error) return null;
  const value = Number(data);
  return value > 0 ? value : null;
}

registerPlaceAdmin(app, { admin, requireOwner });

if (!Deno.env.get("PLUG_USER_HASH_PEPPER")?.trim()) {
  Deno.serve(() => Response.json({ error: "PLUG_USER_HASH_PEPPER is not set" }, { status: 500 }));
} else {
  Deno.serve(app.fetch);
}
