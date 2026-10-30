import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { registerTaxonomyRoutes } from "./taxonomy_admin.ts";

type Owner = { id: string };
type Ctx = { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined; param: (name: string) => string; json: () => Promise<Record<string, unknown>> } };

const PAGE = 50;
const PCODE = /^JM\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUES = new Set(["duplicate", "no_brand", "parish_mismatch", "pin_unchecked", "company_name", "not_verified"]);
const PINS = new Set(["unchecked", "confirmed", "offset"]);
const SOURCES = new Set(["fleet", "plug", "manual", "import"]);
const SORTS = new Set(["issue_count", "name", "updated_at", "parish_name", "status", "brand_name", "geofence_m", "price_e10_87", "pin_state"]);

export type StationListQuery = {
  page: number;
  q: string;
  status: string;
  pcode: string;
  brand: string;
  pin: string;
  source: string;
  issue: string;
  sort: string;
  dir: "asc" | "desc";
};

export function parseStationListQuery(input: {
  page?: string | null;
  q?: string | null;
  status?: string | null;
  pcode?: string | null;
  brand?: string | null;
  pin?: string | null;
  source?: string | null;
  issue?: string | null;
  sort?: string | null;
  dir?: string | null;
}): { ok: true; value: StationListQuery } | { ok: false; error: string } {
  const pcode = String(input.pcode || "").trim();
  if (pcode && !PCODE.test(pcode)) return { ok: false, error: "Parish code must look like JM01" };
  const brand = String(input.brand || "").trim();
  if (brand && brand !== "none" && !UUID.test(brand)) return { ok: false, error: "Brand must be a UUID or none" };
  const pin = String(input.pin || "").trim();
  if (pin && !PINS.has(pin)) return { ok: false, error: "Unknown pin state" };
  const source = String(input.source || "").trim();
  if (source && !SOURCES.has(source)) return { ok: false, error: "Unknown source" };
  const issue = String(input.issue || "").trim();
  if (issue && !ISSUES.has(issue)) return { ok: false, error: "Unknown issue" };
  const sort = String(input.sort || "issue_count").trim() || "issue_count";
  if (!SORTS.has(sort)) return { ok: false, error: "Unknown sort" };
  const dirRaw = String(input.dir || "").trim();
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (sort === "name" || sort === "parish_name" || sort === "brand_name" ? "asc" : "desc");
  return {
    ok: true,
    value: {
      page: Math.max(1, Number(input.page || 1) || 1),
      q: String(input.q || "").trim(),
      status: String(input.status || "").trim(),
      pcode,
      brand,
      pin,
      source,
      issue,
      sort,
      dir,
    },
  };
}

export function placePatchFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("placeType" in body || "place_type" in body) {
    patch.place_type = String(body.placeType ?? body.place_type ?? "").trim() || null;
  }
  if ("name" in body) patch.name = String(body.name ?? "").trim() || null;
  if ("lat" in body) patch.lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
  if ("lng" in body) patch.lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
  if ("address" in body) patch.address = body.address ? String(body.address) : null;
  if ("parish" in body) patch.parish = body.parish ? String(body.parish) : null;
  if ("phone" in body) patch.phone = body.phone ? String(body.phone) : null;
  if ("website" in body) patch.website = body.website ? String(body.website) : null;
  if ("brandId" in body || "brand_id" in body) {
    const raw = "brandId" in body ? body.brandId : body.brand_id;
    patch.brand_id = raw ? String(raw) : null;
  }
  if ("geofenceM" in body || "geofence_m" in body) {
    const raw = "geofenceM" in body ? body.geofenceM : body.geofence_m;
    patch.geofence_m = raw == null || raw === "" ? null : Number(raw);
  }
  if ("attributes" in body) patch.attributes = (body.attributes as Record<string, unknown>) || {};
  if ("pinState" in body || "pin_state" in body) {
    const raw = String(("pinState" in body ? body.pinState : body.pin_state) || "");
    patch.pin_state = raw === "offset" || raw === "confirmed" ? raw : "unchecked";
  }
  if ("plusCode" in body || "plus_code" in body) {
    const raw = "plusCode" in body ? body.plusCode : body.plus_code;
    patch.plus_code = raw ? String(raw) : null;
  }
  if ("status" in body) patch.status = body.status ? String(body.status) : null;
  if ("verifiedAt" in body || "verified_at" in body) {
    const raw = "verifiedAt" in body ? body.verifiedAt : body.verified_at;
    patch.verified_at = raw ? String(raw) : null;
  }
  return patch;
}

export const TYPE_PROFILE_CONFLICT = "Changing a gas station to another type moves it out of fuel matching. Change these one at a time.";

export function pinInsideJamaica(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 17.6 && lat <= 18.6 && lng >= -78.5 && lng <= -76.1;
}

export function pinOutsideMessage(lat: unknown, lng: unknown): string | null {
  const la = lat == null || lat === "" ? Number.NaN : Number(lat);
  const ln = lng == null || lng === "" ? Number.NaN : Number(lng);
  return pinInsideJamaica(la, ln) ? null : "Pin outside Jamaica";
}

export function matchProfileConflict(fromProfile: string, toProfile: string) {
  if (fromProfile && toProfile && fromProfile !== toProfile) return TYPE_PROFILE_CONFLICT;
  return null;
}

export function staticMissing(row: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!row.place_type) missing.push("Type");
  if (!String(row.name || "").trim()) missing.push("Name");
  if (row.lat == null || row.lng == null || !pinInsideJamaica(Number(row.lat), Number(row.lng))) missing.push("Pin");
  const pin = String(row.pin_state || "unchecked");
  if (pin !== "confirmed" && pin !== "offset") missing.push("Pin checked");
  return missing;
}

export function csvField(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function registerHttpStatus(message: string): 400 | 403 | 404 | 409 | 500 {
  if (/only the owner/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/moves it out of fuel|in use|already exists/i.test(message)) return 409;
  if (/required|outside jamaica|unknown|choose|must look|nothing to change|parish code|bad /i.test(message)) return 400;
  return 500;
}

function ownerRefusal(err: unknown, fallback: string): { message: string; status: 400 | 403 | 404 | 409 | 500 } {
  const message = err instanceof Error ? err.message : fallback;
  const tagged = err as { status?: number };
  if (tagged?.status === 400 || tagged?.status === 403 || tagged?.status === 404 || tagged?.status === 409 || tagged?.status === 500) {
    return { message, status: tagged.status };
  }
  return { message, status: registerHttpStatus(message) };
}

function httpError(c: { json: (body: unknown, status?: number) => Response }, err: unknown, fallback: string) {
  const refused = ownerRefusal(err, fallback);
  return c.json({ error: refused.message }, refused.status);
}

type FlagRow = {
  status?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  price_e10_87?: number | null;
  parish_text_mismatch?: boolean | null;
  pin_state?: string | null;
  company_style_name?: boolean | null;
  possible_duplicate?: boolean | null;
  possible_duplicate_ids?: string[] | null;
  pcode1?: string | null;
  parish_name?: string | null;
};

export function summarizeStationFlags(rows: FlagRow[]) {
  const issues = {
    duplicate: 0,
    no_brand: 0,
    parish_mismatch: 0,
    pin_unchecked: 0,
    company_name: 0,
    not_verified: 0,
  };
  let verified = 0;
  let pending = 0;
  let priced = 0;
  const parishes = new Map<string, string>();
  const brands = new Map<string, string>();
  for (const row of rows) {
    if (row.status === "verified") verified += 1;
    if (row.status === "pending") pending += 1;
    if (row.price_e10_87 != null) priced += 1;
    if (row.possible_duplicate || (row.possible_duplicate_ids || []).length) issues.duplicate += 1;
    if (!row.brand_id) issues.no_brand += 1;
    if (row.parish_text_mismatch) issues.parish_mismatch += 1;
    if (row.pin_state === "unchecked") issues.pin_unchecked += 1;
    if (row.company_style_name) issues.company_name += 1;
    if (row.status !== "verified") issues.not_verified += 1;
    if (row.pcode1 && row.parish_name) parishes.set(row.pcode1, row.parish_name);
    if (row.brand_id && row.brand_name) brands.set(row.brand_id, row.brand_name);
  }
  return {
    summary: {
      total: rows.length,
      verified,
      pending,
      priced,
      issues,
    },
    parishes: [...parishes.entries()].map(([pcode, name]) => ({ pcode, name })).sort((a, b) => a.name.localeCompare(b.name)),
    brands: [...brands.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function places(sb: SupabaseClient) {
  return sb.schema("places");
}

export function reviewChipForPlace(row: {
  status?: string | null;
  origin_app?: string | null;
  legacy_payload?: unknown;
}): string {
  if (row.status === "learnt") return "learnt";
  const legacy = row.legacy_payload && typeof row.legacy_payload === "object" && !Array.isArray(row.legacy_payload)
    ? row.legacy_payload as Record<string, unknown>
    : {};
  if (row.status === "pending" && String(legacy.dataSource || "") === "import") return "import";
  if (row.origin_app === "roam_plug" && row.status === "pending") return "plug";
  return "hand";
}

export const PLACE_EVIDENCE_COLUMNS = "id, note, origin_app, accuracy_m, created_at";
export const PLACE_PRICE_COLUMNS = "grade, price_per_litre, observed_at, confidence, report_count, petrojam_week, valid_until, outdated";

export function evidenceTitle(note: unknown): string {
  const text = String(note || "").trim();
  return text || "Evidence";
}

async function missingChecklist(sb: SupabaseClient, row: Record<string, unknown>): Promise<string[]> {
  const missing = staticMissing(row);
  const nearby = await duplicateHits(sb, Number(row.lat), Number(row.lng), String(row.place_type || ""), String(row.id || ""));
  if (nearby.length) missing.push("Open duplicate");
  return missing;
}

async function duplicateHits(sb: SupabaseClient, lat: number, lng: number, placeType: string, exceptId: string) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !placeType) return [];
  const { data, error } = await places(sb).rpc("nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: 2000,
    p_statuses: ["verified", "pending", "learnt"],
  });
  if (error) throw error;
  return ((data || []) as Array<Record<string, unknown>>).filter((hit) => {
    if (String(hit.id) === exceptId) return false;
    if (String(hit.place_type) !== placeType) return false;
    const fence = Number(hit.effective_geofence_m) || 50;
    return Number(hit.distance_m) <= fence;
  });
}

type ReadGuard = (c: any) => Promise<Owner | Response>;

export function registerPlaceAdmin(
  app: Hono,
  deps: { admin: () => SupabaseClient; requireOwner: (c: any) => Promise<Owner>; requirePlatformAdmin: ReadGuard },
) {
  async function allowRead(c: any): Promise<Response | null> {
    const auth = await deps.requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    return null;
  }

  registerTaxonomyRoutes(app, deps);

  app.get("/admin/register/nearby", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const lat = Number(c.req.query("lat"));
      const lng = Number(c.req.query("lng"));
      const placeType = String(c.req.query("type") || "");
      const exceptId = String(c.req.query("except") || "");
      const hits = await duplicateHits(deps.admin(), lat, lng, placeType, exceptId);
      return c.json({ duplicates: hits });
    } catch (err) {
      return httpError(c, err, "Could not check duplicates");
    }
  });

  app.get("/admin/register/export", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const parsed = parsePlaceListQuery(readListInput(c));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const listed = await loadPlaceRegister(deps.admin(), { ...parsed.value, page: 1 }, true);
      const header = ["name", "brand", "place type", "address", "town", "parish", "lat", "lng", "status", "phone"];
      const lines = [header.join(",")];
      for (const row of listed.rows) {
        lines.push([
          csvField(row.name),
          csvField(row.brand_name),
          csvField(row.place_type),
          csvField(row.address),
          csvField(row.town_name),
          csvField(row.parish_name),
          csvField(row.lat),
          csvField(row.lng),
          csvField(row.status),
          csvField(row.phone),
        ].join(","));
      }
      return new Response(lines.join("\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    } catch (err) {
      return httpError(c, err, "Could not export places");
    }
  });

  app.get("/admin/register", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const placeTypeEarly = String(c.req.query("type") || "");
      if (placeTypeEarly === "gas_station" && c.req.query("list") !== "places") {
        const parsed = parseStationListQuery({
          page: c.req.query("page"),
          q: c.req.query("q"),
          status: c.req.query("status"),
          pcode: c.req.query("pcode"),
          brand: c.req.query("brand"),
          pin: c.req.query("pin"),
          source: c.req.query("source"),
          issue: c.req.query("issue"),
          sort: c.req.query("sort"),
          dir: c.req.query("dir"),
        });
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
        const listed = await loadGasStations(deps.admin(), parsed.value);
        return c.json(listed);
      }
      const parsed = parsePlaceListQuery(readListInput(c));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const listed = await loadPlaceRegister(deps.admin(), parsed.value, false);
      return c.json(listed);
    } catch (err) {
      return httpError(c, err, "Could not load places");
    }
  });

  app.get("/admin/register/:id", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const sb = deps.admin();
      const id = c.req.param("id");
      const { data, error } = await places(sb).from("place").select(`
        id, name, place_type, brand_id, operator, lat, lng, plus_code, pcode, address, parish, phone, website,
        attributes, status, pin_state, geofence_m, origin_app, verified_at, updated_at,
        brand:brand_id ( name, slug ),
        place_facility ( id, facility_type, label, attributes ),
        place_alias ( id, kind, raw_value, normalized_value, lat, lng )
      `).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "Place not found" }, 404);
      const [evidenceResult, historyResult, pricesResult, publicResult] = await Promise.all([
        places(sb).from("place_evidence").select(PLACE_EVIDENCE_COLUMNS).eq("place_id", id).order("created_at", { ascending: false }).limit(20),
        sb.schema("fleet").from("master_change_log").select("action, reason, actor, created_at").eq("dataset", "place").eq("record_id", id).order("created_at", { ascending: false }).limit(20),
        places(sb).from("price_current").select(PLACE_PRICE_COLUMNS).eq("place_id", id),
        places(sb).from("public_place").select("id").eq("id", id).maybeSingle(),
      ]);
      if (evidenceResult.error) throw evidenceResult.error;
      if (pricesResult.error) throw pricesResult.error;
      if (publicResult.error) throw publicResult.error;
      const wholesale = await places(sb).rpc("wholesale_on", { p_grade: "e10_87", p_on: new Date().toISOString().slice(0, 10) });
      return c.json({
        place: data,
        evidence: evidenceResult.data || [],
        history: historyResult.error ? [] : (historyResult.data || []),
        prices: pricesResult.data || [],
        wholesaleE10: wholesale.error ? null : wholesale.data,
        public: Boolean(publicResult.data),
      });
    } catch (err) {
      return httpError(c, err, "Could not load place");
    }
  });

  app.post("/admin/register", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const saved = await savePlace(deps.admin(), owner.id, null, body);
      return c.json(saved);
    } catch (err) {
      const refused = ownerRefusal(err, "Could not save place");
      return c.json({ error: refused.message }, refused.status);
    }
  });

  app.patch("/admin/register/:id", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const saved = await savePlace(deps.admin(), owner.id, c.req.param("id"), body);
      return c.json(saved);
    } catch (err) {
      const refused = ownerRefusal(err, "Could not save place");
      return c.json({ error: refused.message }, refused.status);
    }
  });

  app.post("/admin/register/:id/verify", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const sb = deps.admin();
      const id = c.req.param("id");
      const { data: row, error } = await places(sb).from("place").select("id,name,place_type,lat,lng,status,pin_state").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!row) return c.json({ error: "Place not found" }, 404);
      const missing = await missingChecklist(sb, row);
      if (missing.length) return c.json({ ok: false, missing }, 400);
      await applyRegisterUpdate(sb, id, {
        status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: owner.id,
      }, null, owner.id, "Verified");
      const { error: publishError } = await places(sb).rpc("refresh_public_place", { p_place_id: id });
      if (publishError) throw publishError;
      return c.json({ ok: true });
    } catch (err) {
      return httpError(c, err, "Could not verify");
    }
  });

  app.post("/admin/register/:id/merge", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const current = c.req.param("id");
      const keep = String(body.keep || current);
      const drop = String(body.drop || "");
      const reason = String(body.reason || "").trim();
      if (!drop || keep === drop) return c.json({ error: "Choose two different places" }, 400);
      if (!reason) return c.json({ error: "A reason is required" }, 400);
      const { error } = await places(deps.admin()).rpc("merge_place", {
        p_keep: keep,
        p_drop: drop,
        p_reason: reason,
        p_actor: owner.id,
      });
      if (error) throw error;
      return c.json({ ok: true, keep });
    } catch (err) {
      return httpError(c, err, "Could not merge places");
    }
  });

  app.post("/admin/register/bulk", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const action = String(body.action || "");
      const reason = String(body.reason || "").trim();
      const sb = deps.admin();
      if (!ids.length) return c.json({ error: "Choose at least one place" }, 400);
      if (!reason) return c.json({ error: "A reason is required" }, 400);
      if (action === "type" && body.placeType) {
        await assertBulkType(sb, ids, String(body.placeType));
        for (const id of ids) {
          const current = await placeSnapshot(sb, id);
          await applyRegisterUpdate(sb, id, { place_type: String(body.placeType), name: current.name }, null, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "add-facility" && body.facility) {
        for (const id of ids) {
          const current = await placeSnapshot(sb, id);
          const facilities = current.facilities.filter((row) => row.facility_type !== String(body.facility));
          facilities.push({ facility_type: String(body.facility), label: null, attributes: {} });
          await applyRegisterUpdate(sb, id, { name: current.name }, facilities, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "remove-facility" && body.facility) {
        for (const id of ids) {
          const current = await placeSnapshot(sb, id);
          const facilities = current.facilities.filter((row) => row.facility_type !== String(body.facility));
          await applyRegisterUpdate(sb, id, { name: current.name }, facilities, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "set_brand") {
        for (const id of ids) {
          await applyRegisterUpdate(sb, id, { brand_id: body.brandId ? String(body.brandId) : null }, null, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "pin_confirmed") {
        for (const id of ids) {
          await applyRegisterUpdate(sb, id, { pin_state: "confirmed" }, null, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "duplicate_of") {
        if (!body.duplicateOf) return c.json({ error: "Choose the station to keep" }, 400);
        for (const id of ids) {
          if (id === String(body.duplicateOf)) continue;
          await applyRegisterUpdate(sb, id, { status: "duplicate", duplicate_of: String(body.duplicateOf) }, null, owner.id, reason);
          await refreshPlace(sb, id);
        }
      } else if (action === "verify") {
        const blocked: string[] = [];
        for (const id of ids) {
          const { data: row } = await places(sb).from("place").select("id,name,place_type,lat,lng,pin_state").eq("id", id).maybeSingle();
          if (!row) continue;
          const missing = await missingChecklist(sb, row);
          if (missing.length) blocked.push(id);
          else {
            await applyRegisterUpdate(sb, id, {
              status: "verified",
              verified_at: new Date().toISOString(),
              verified_by: owner.id,
            }, null, owner.id, reason);
            await refreshPlace(sb, id);
          }
        }
        return c.json({ ok: true, blocked });
      } else {
        return c.json({ error: "That bulk action is not available" }, 400);
      }
      return c.json({ ok: true });
    } catch (err) {
      return httpError(c, err, "Could not update places");
    }
  });

  app.post("/admin/register/import", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : [];
      const dryRun = body.dry_run === true || body.dryRun === true;
      const fileName = String(body.fileName || body.file || "places.csv");
      const sb = deps.admin();
      const checked = await checkImportRows(sb, rows);
      const errorCount = checked.filter((row) => row.errors.length).length;
      if (dryRun || errorCount) return c.json({ rows: checked, errorCount, saved: 0 });
      let saved = 0;
      for (const row of checked) {
        await savePlace(sb, owner.id, null, {
          placeType: row.placeType,
          name: row.name,
          lat: row.lat,
          lng: row.lng,
          address: row.address,
          phone: row.phone,
          facilities: row.facilities,
          verify: false,
          reason: `Imported from ${fileName}`,
        });
        saved += 1;
      }
      return c.json({ rows: checked, errorCount: 0, saved });
    } catch (err) {
      return httpError(c, err, "Could not import");
    }
  });

  app.get("/admin/review", async (c) => {
    try {
      await deps.requireOwner(c);
      const chip = String(c.req.query("chip") || "");
      const sb = deps.admin();
      const items: Array<Record<string, unknown>> = [];
      if (!chip || chip === "plug" || chip === "learnt" || chip === "import" || chip === "hand") {
        let query = places(sb).from("place").select("id,name,place_type,lat,lng,status,origin_app,legacy_payload,created_at").in("status", ["pending", "learnt"]).order("created_at", { ascending: false }).limit(200);
        if (chip === "plug") query = query.eq("origin_app", "roam_plug").eq("status", "pending");
        if (chip === "learnt") query = query.eq("status", "learnt");
        if (chip === "import") query = query.eq("status", "pending").filter("legacy_payload->>dataSource", "eq", "import");
        const { data, error } = await query;
        if (error) throw error;
        for (const row of data || []) {
          const kind = reviewChipForPlace(row);
          if (chip && kind !== chip) continue;
          items.push({ id: row.id, chip: kind, title: row.name, placeId: row.id, lat: row.lat, lng: row.lng, placeType: row.place_type, createdAt: row.created_at });
        }
      }
      if (!chip || chip === "hand" || chip === "facility" || chip === "evidence") {
        const { data, error } = await places(sb).from("place_change_proposal").select("id,place_id,kind,payload,created_at").eq("status", "pending").order("created_at").limit(100);
        if (error) throw error;
        for (const row of data || []) {
          const kind = row.kind === "facility_add" || row.kind === "facility_remove" ? "facility" : "hand";
          if (chip && chip !== kind && chip !== "evidence") continue;
          if (chip === "evidence") continue;
          const payload = (row.payload || {}) as { name?: string; lat?: number; lng?: number };
          items.push({ id: row.id, chip: kind, title: payload.name || row.kind, placeId: row.place_id, lat: payload.lat, lng: payload.lng, proposal: true, kind: row.kind, createdAt: row.created_at });
        }
      }
      if (chip === "price") {
        const { data, error } = await places(sb).from("price_report_check").select("source, report_id, reasons, detail, checked_at").eq("status", "review").order("checked_at", { ascending: true }).limit(50);
        if (error) throw error;
        for (const row of data || []) {
          const detail = (row.detail || {}) as { place_name?: string; grade?: string; price?: number; place_id?: string };
          const price = detail.price != null ? `J$${Number(detail.price).toFixed(2)}` : "Price";
          items.push({
            id: row.report_id,
            chip: "price",
            title: `${detail.place_name || "Station"} · ${detail.grade || "grade"} · ${price}`,
            placeId: detail.place_id || "",
            href: "/?page=fuel-price-engine",
            external: true,
            reasons: row.reasons,
            createdAt: row.checked_at,
          });
        }
      }
      if (!chip || chip === "evidence") {
        const { data, error } = await places(sb).from("place_evidence").select("id, place_id, note, origin_app, accuracy_m, created_at").order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        for (const row of data || []) {
          items.push({ id: row.id, chip: "evidence", title: evidenceTitle(row.note), placeId: row.place_id, originApp: row.origin_app, accuracyM: row.accuracy_m, proposal: false, createdAt: row.created_at });
        }
      }
      if (!chip || chip === "hand-review") {
        const { data, error } = await sb.from("fleet_fuel_entries").select("id,organization_id,payload_json").not("payload_json->metadata->handReview->>reason", "is", null).order("updated_at", { ascending: false }).limit(100);
        if (error) throw error;
        for (const row of data || []) {
          const payload = (row.payload_json || {}) as Record<string, unknown>;
          const meta = (payload.metadata || {}) as Record<string, unknown>;
          const review = (meta.handReview || {}) as { reason?: string };
          if (!String(review.reason || "").trim()) continue;
          const loc = (meta.locationMetadata || {}) as { lat?: number; lng?: number };
          items.push({
            id: row.id,
            chip: "hand-review",
            title: String(payload.vendor || payload.location || meta.stationName || "Fuel fill"),
            placeId: String(payload.matchedStationId || meta.matchedStationId || ""),
            organizationId: row.organization_id,
            lat: loc.lat ?? null,
            lng: loc.lng ?? null,
            href: "/?page=fuel-stations&tab=resolution-queue",
            external: true,
            createdAt: payload.date || null,
          });
        }
      }
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load review" }, 400);
    }
  });

}

async function applyRegisterUpdate(
  sb: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  facilities: unknown[] | null,
  actor: string | null,
  reason: string | null,
  extra?: { addAlias?: Record<string, unknown> | null; removeAlias?: string | null },
) {
  const { error } = await places(sb).rpc("save_register_update", {
    p_id: id,
    p_patch: patch,
    p_facilities: facilities,
    p_actor: actor,
    p_reason: reason,
    p_add_alias: extra?.addAlias || null,
    p_remove_alias: extra?.removeAlias || null,
  });
  if (error) throw error;
}

async function savePlace(sb: SupabaseClient, ownerId: string | null, id: string | null, body: Record<string, unknown>) {
  const reason = body.reason ? String(body.reason) : null;
  if (id && body.duplicateOf) {
    await applyRegisterUpdate(sb, id, { status: "duplicate", duplicate_of: String(body.duplicateOf) }, null, ownerId, reason);
    return { id, ok: true };
  }
  if (id) {
    if ("lat" in body || "lng" in body) {
      const { data: currentPin } = await places(sb).from("place").select("lat,lng").eq("id", id).maybeSingle();
      const lat = "lat" in body ? body.lat : currentPin?.lat;
      const lng = "lng" in body ? body.lng : currentPin?.lng;
      const moved = pinOutsideMessage(lat, lng);
      if (moved) {
        const err = new Error(moved) as Error & { status: number };
        err.status = 400;
        throw err;
      }
    }
    const patch = placePatchFromBody(body);
    const facilities = Array.isArray(body.facilities) ? body.facilities : null;
    const addAlias = body.addAlias && typeof body.addAlias === "object" ? body.addAlias as Record<string, unknown> : null;
    const removeAlias = body.removeAliasId ? String(body.removeAliasId) : null;
    if (!Object.keys(patch).length && facilities == null && !addAlias && !removeAlias) {
      throw new Error("Nothing to change");
    }
    await applyRegisterUpdate(sb, id, patch, facilities, ownerId, reason, { addAlias, removeAlias });
    if (body.verify === true) {
      const { data: current } = await places(sb).from("place").select("id,name,place_type,lat,lng,pin_state").eq("id", id).single();
      const missing = await missingChecklist(sb, current || {});
      if (missing.length) return { id, ok: false, missing };
      await applyRegisterUpdate(sb, id, { status: "verified", verified_at: new Date().toISOString() }, null, ownerId, reason || "verified");
      const { error: publishError } = await places(sb).rpc("refresh_public_place", { p_place_id: id });
      if (publishError) throw publishError;
    }
    return { id, ok: true };
  }
  const placeType = String(body.placeType || body.place_type || "").trim();
  const name = String(body.name || "").trim();
  const outside = pinOutsideMessage(body.lat, body.lng);
  if (!placeType || !name) throw new Error("Type, name, and pin are required");
  if (outside) {
    const err = new Error(outside) as Error & { status: number };
    err.status = 400;
    throw err;
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const row = {
    place_type: placeType,
    name,
    lat,
    lng,
    address: body.address ? String(body.address) : null,
    parish: null,
    phone: body.phone ? String(body.phone) : null,
    website: body.website ? String(body.website) : null,
    brand_id: body.brandId || null,
    geofence_m: body.geofenceM == null || body.geofenceM === "" ? null : Number(body.geofenceM),
    attributes: (body.attributes as Record<string, unknown>) || {},
    pin_state: body.pinState === "offset" || body.pinState === "confirmed" ? body.pinState : "unchecked",
  };
  const db = places(sb);
  const saved = await db.from("place").insert({ ...row, status: "pending", origin_app: "manual" }).select("id").single();
  if (saved.error) throw saved.error;
  const placeId = String(saved.data.id);
  if (Array.isArray(body.facilities)) {
    await applyRegisterUpdate(sb, placeId, {}, body.facilities, ownerId, reason || "created");
  }
  if (body.verify === true) {
    const { data: current } = await db.from("place").select("id,name,place_type,lat,lng,pin_state").eq("id", placeId).single();
    const missing = await missingChecklist(sb, current || {});
    if (missing.length) return { id: placeId, ok: false, missing };
    await applyRegisterUpdate(sb, placeId, { status: "verified", verified_at: new Date().toISOString() }, null, ownerId, reason || "verified");
    await db.rpc("refresh_public_place", { p_place_id: placeId });
  }
  return { id: placeId, ok: true };
}

const PLACE_SORTS = new Set(["name", "place_type", "status", "updated_at"]);
const PLACE_ISSUES = new Set(["pin_unchecked", "verified_pin_unchecked", "no_brand", "no_phone", "parish_mismatch", "outside_jamaica", "area_parish_only", "duplicate", "company_name", "not_verified"]);

function readListInput(c: { req: { query: (name: string) => string | undefined } }) {
  return {
    page: c.req.query("page"),
    q: c.req.query("q"),
    status: c.req.query("status"),
    pcode: c.req.query("pcode"),
    brand: c.req.query("brand"),
    pin: c.req.query("pin"),
    source: c.req.query("source"),
    issue: c.req.query("issue"),
    sort: c.req.query("sort"),
    dir: c.req.query("dir"),
    group: c.req.query("group"),
    category: c.req.query("category"),
    type: c.req.query("type"),
    parish: c.req.query("parish"),
  };
}

export function parsePlaceListQuery(input: {
  page?: string | null;
  q?: string | null;
  status?: string | null;
  pcode?: string | null;
  brand?: string | null;
  pin?: string | null;
  source?: string | null;
  issue?: string | null;
  sort?: string | null;
  dir?: string | null;
  group?: string | null;
  category?: string | null;
  type?: string | null;
  parish?: string | null;
}): { ok: true; value: StationListQuery & { group: string; category: string; type: string; parish: string } } | { ok: false; error: string } {
  const parsed = parseStationListQuery({ ...input, sort: input.sort === "type" ? "name" : input.sort === "updated" ? "updated_at" : input.sort });
  if (!parsed.ok && input.sort && !PLACE_SORTS.has(input.sort === "type" ? "place_type" : input.sort === "updated" ? "updated_at" : input.sort)) {
    return parsed;
  }
  const pcode = String(input.pcode || "").trim();
  if (pcode && !PCODE.test(pcode)) return { ok: false, error: "Parish code must look like JM01" };
  const brand = String(input.brand || "").trim();
  if (brand && brand !== "none" && !UUID.test(brand)) return { ok: false, error: "Brand must be a UUID or none" };
  const pin = String(input.pin || "").trim();
  if (pin && !PINS.has(pin)) return { ok: false, error: "Unknown pin state" };
  const source = String(input.source || "").trim();
  if (source && !SOURCES.has(source)) return { ok: false, error: "Unknown source" };
  const issue = String(input.issue || "").trim();
  if (issue && !PLACE_ISSUES.has(issue) && !ISSUES.has(issue)) return { ok: false, error: "Unknown issue" };
  const rawSort = String(input.sort || "name").trim() || "name";
  const sort = rawSort === "type" ? "place_type" : rawSort === "updated" ? "updated_at" : rawSort;
  if (!PLACE_SORTS.has(sort)) return { ok: false, error: "Unknown sort" };
  const dirRaw = String(input.dir || "").trim();
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "asc";
  return {
    ok: true,
    value: {
      page: Math.max(1, Number(input.page || 1) || 1),
      q: String(input.q || "").trim(),
      status: String(input.status || "").trim(),
      pcode,
      brand,
      pin,
      source,
      issue,
      sort,
      dir,
      group: String(input.group || "").trim(),
      category: String(input.category || "").trim(),
      type: String(input.type || "").trim(),
      parish: String(input.parish || "").trim(),
    },
  };
}

type PlaceListFilters = StationListQuery & { group: string; category: string; type: string; parish: string };

async function loadPlaceRegister(sb: SupabaseClient, filters: PlaceListFilters, allRows: boolean) {
  const db = places(sb);
  let query = db.from("place_list_row").select("*", { count: "exact" });
  if (filters.type) query = query.eq("place_type", filters.type);
  if (filters.category) query = query.eq("category_code", filters.category);
  if (filters.group) query = query.eq("group_code", filters.group);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.pcode) query = query.eq("pcode1", filters.pcode);
  if (filters.parish) query = query.ilike("parish_name", filters.parish);
  if (filters.brand === "none") query = query.is("brand_id", null);
  else if (filters.brand) query = query.eq("brand_id", filters.brand);
  if (filters.pin) query = query.eq("pin_state", filters.pin);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.issue === "pin_unchecked") query = query.eq("pin_unchecked", true);
  if (filters.issue === "verified_pin_unchecked") query = query.eq("verified_pin_unchecked", true);
  if (filters.issue === "no_brand") query = query.eq("no_brand", true);
  if (filters.issue === "area_parish_only") query = query.eq("area_parish_only", true);
  if (filters.issue === "no_phone") query = query.eq("no_phone", true);
  if (filters.issue === "parish_mismatch") query = query.eq("parish_text_mismatch", true);
  if (filters.issue === "outside_jamaica") query = query.eq("outside_jamaica", true);
  if (filters.q) {
    const { data: aliasHits } = await db.from("place_alias").select("place_id").ilike("normalized_value", `%${filters.q.toLowerCase()}%`).limit(50);
    const ids = (aliasHits || []).map((row) => row.place_id).filter(Boolean);
    const parts = [
      `name.ilike.%${filters.q}%`,
      `address.ilike.%${filters.q}%`,
      `plus_code.ilike.%${filters.q}%`,
      `brand_name.ilike.%${filters.q}%`,
      `parish_name.ilike.%${filters.q}%`,
    ];
    if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }
  const ascending = filters.dir === "asc";
  let ordered = query.order(filters.sort, { ascending });
  if (filters.sort !== "name") ordered = ordered.order("name", { ascending: true });
  const listed = allRows ? await ordered.range(0, 4999) : await ordered.range((filters.page - 1) * PAGE, filters.page * PAGE - 1);
  if (listed.error) throw listed.error;
  const summaryQuery = await db.from("place_list_row").select("status,pin_state,pin_unchecked,no_brand,no_phone,parish_text_mismatch,outside_jamaica");
  if (summaryQuery.error) throw summaryQuery.error;
  const summaryRows = (summaryQuery.data || []) as Array<Record<string, unknown>>;
  let verified = 0;
  let pending = 0;
  let pinsChecked = 0;
  let needAttention = 0;
  for (const row of summaryRows) {
    if (row.status === "verified") verified += 1;
    if (row.status === "pending") pending += 1;
    if (row.pin_state === "confirmed" || row.pin_state === "offset") pinsChecked += 1;
    if (row.pin_unchecked || row.no_brand || row.no_phone || row.parish_text_mismatch || row.outside_jamaica) needAttention += 1;
  }
  return {
    rows: listed.data || [],
    total: listed.count || 0,
    page: filters.page,
    summary: {
      total: summaryRows.length,
      verified,
      pending,
      pinsChecked,
      onPlug: verified,
      needAttention,
    },
  };
}

async function placeSnapshot(sb: SupabaseClient, id: string) {
  const db = places(sb);
  const place = await db.from("place").select("id,name,place_type").eq("id", id).maybeSingle();
  if (place.error) throw place.error;
  if (!place.data) throw new Error("Place not found");
  const facilities = await db.from("place_facility").select("facility_type,label,attributes").eq("place_id", id);
  if (facilities.error) throw facilities.error;
  return {
    name: place.data.name,
    place_type: place.data.place_type,
    facilities: (facilities.data || []) as Array<{ facility_type: string; label: string | null; attributes: Record<string, unknown> }>,
  };
}

async function assertBulkType(sb: SupabaseClient, ids: string[], nextType: string) {
  const db = places(sb);
  const next = await db.from("place_type").select("slug,match_profile").eq("slug", nextType).maybeSingle();
  if (next.error) throw next.error;
  if (!next.data) throw new Error(`Unknown place type ${nextType}`);
  const rows = await db.from("place").select("id,place_type").in("id", ids);
  if (rows.error) throw rows.error;
  const slugs = [...new Set((rows.data || []).map((row) => String(row.place_type || "")).filter(Boolean))];
  const types = slugs.length
    ? await db.from("place_type").select("slug,match_profile").in("slug", slugs)
    : { data: [], error: null };
  if (types.error) throw types.error;
  const profile = new Map((types.data || []).map((row) => [row.slug, row.match_profile]));
  for (const row of rows.data || []) {
    const conflict = matchProfileConflict(String(profile.get(row.place_type) || ""), String(next.data.match_profile || ""));
    if (conflict) {
      const err = new Error(conflict) as Error & { status: number };
      err.status = 409;
      throw err;
    }
  }
}

async function refreshPlace(sb: SupabaseClient, id: string) {
  const { error } = await places(sb).rpc("refresh_public_place", { p_place_id: id });
  if (error) throw error;
}

async function checkImportRows(sb: SupabaseClient, rows: Array<Record<string, unknown>>) {
  const db = places(sb);
  const { data: types } = await db.from("place_type").select("slug");
  const { data: facilities } = await db.from("facility_type").select("slug");
  const typeSet = new Set((types || []).map((row) => row.slug));
  const facilitySet = new Set((facilities || []).map((row) => row.slug));
  const checked = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const errors: string[] = [];
    const placeType = String(row.placeType || row.place_type || "").trim();
    const name = String(row.name || "").trim();
    const slugs = String(row.facilities || "").split("|").map((slug) => slug.trim()).filter(Boolean);
    if (!placeType || !typeSet.has(placeType)) errors.push(placeType ? `Unknown place type ${placeType}` : "Place type is required");
    const unknown = slugs.find((slug) => !facilitySet.has(slug));
    if (unknown) errors.push(`Unknown facility ${unknown}`);
    if (!name) errors.push("Name is required");
    const pinError = pinOutsideMessage(row.lat, row.lng);
    if (pinError) errors.push(pinError);
    let parish: string | null = null;
    let duplicates: unknown[] = [];
    if (!pinError) {
      const named = await db.rpc("parish_name_at", { p_lat: Number(row.lat), p_lng: Number(row.lng) });
      parish = named.error ? null : (named.data as string | null);
      duplicates = await duplicateHits(sb, Number(row.lat), Number(row.lng), placeType, "");
      if (duplicates.length) errors.push("Open duplicate");
    }
    checked.push({
      row: index + 1,
      name,
      placeType,
      facilities: slugs,
      lat: row.lat,
      lng: row.lng,
      address: row.address ? String(row.address) : null,
      phone: row.phone ? String(row.phone) : null,
      parish,
      duplicates,
      errors,
    });
  }
  return checked;
}

async function loadGasStations(sb: SupabaseClient, filters: StationListQuery) {
  const db = places(sb);
  let query = db.from("station_list_row").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.pcode) query = query.eq("pcode1", filters.pcode);
  if (filters.brand === "none") query = query.is("brand_id", null);
  else if (filters.brand) query = query.eq("brand_id", filters.brand);
  if (filters.pin) query = query.eq("pin_state", filters.pin);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.issue === "duplicate") query = query.eq("possible_duplicate", true);
  if (filters.issue === "no_brand") query = query.eq("no_brand", true);
  if (filters.issue === "parish_mismatch") query = query.eq("parish_text_mismatch", true);
  if (filters.issue === "pin_unchecked") query = query.eq("pin_unchecked", true);
  if (filters.issue === "company_name") query = query.eq("company_style_name", true);
  if (filters.issue === "not_verified") query = query.eq("not_verified", true);
  if (filters.q) {
    const { data: aliasHits } = await db.from("place_alias").select("place_id").ilike("normalized_value", `%${filters.q.toLowerCase()}%`).limit(50);
    const ids = (aliasHits || []).map((row) => row.place_id).filter(Boolean);
    const parts = [
      `name.ilike.%${filters.q}%`,
      `address.ilike.%${filters.q}%`,
      `plus_code.ilike.%${filters.q}%`,
      `brand_name.ilike.%${filters.q}%`,
      `parish_name.ilike.%${filters.q}%`,
    ];
    if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }
  const from = (filters.page - 1) * PAGE;
  const ascending = filters.dir === "asc";
  let ordered = query.order(filters.sort, { ascending });
  if (filters.sort !== "name") ordered = ordered.order("name", { ascending: true });
  const listed = await ordered.range(from, from + PAGE - 1);
  if (listed.error) throw listed.error;
  const summaryQuery = await db.from("station_list_row").select("status,brand_id,brand_name,price_e10_87,parish_text_mismatch,pin_state,company_style_name,possible_duplicate,possible_duplicate_ids,pcode1,parish_name");
  if (summaryQuery.error) throw summaryQuery.error;
  const fills = await sb.rpc("fleet_station_fill_summary");
  const fillById = new Map<string, { fill_count: number; last_fill_at: string | null }>();
  if (!fills.error) {
    for (const row of (fills.data || []) as Array<{ station_id?: string; fill_count?: number; last_fill_at?: string | null }>) {
      if (row.station_id) fillById.set(row.station_id, { fill_count: Number(row.fill_count || 0), last_fill_at: row.last_fill_at || null });
    }
  }
  const rows = ((listed.data || []) as Array<Record<string, unknown>>).map((row) => {
    const fill = fillById.get(String(row.id));
    return { ...row, fill_count: fill?.fill_count ?? 0, last_fill_at: fill?.last_fill_at ?? null };
  });
  const rolled = summarizeStationFlags((summaryQuery.data || []) as FlagRow[]);
  return { rows, total: listed.count || 0, page: filters.page, ...rolled };
}
