import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

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

function ownerRefusal(err: unknown, fallback: string): { message: string; status: 400 | 403 } {
  const message = err instanceof Error ? err.message : fallback;
  return { message, status: /only the owner/i.test(message) ? 403 : 400 };
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
  const missing: string[] = [];
  if (!row.place_type) missing.push("Type");
  if (!String(row.name || "").trim()) missing.push("Name");
  if (row.lat == null || row.lng == null) missing.push("Pin");
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

  app.get("/admin/taxonomy", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const { data, error } = await places(deps.admin()).rpc("taxonomy");
      if (error) throw error;
      return c.json(data || {});
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load categories" }, 403);
    }
  });

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
      return c.json({ error: err instanceof Error ? err.message : "Could not check duplicates" }, 400);
    }
  });

  app.get("/admin/register", async (c) => {
    try {
      const denied = await allowRead(c);
      if (denied) return denied;
      const sb = places(deps.admin());
      const page = Math.max(1, Number(c.req.query("page") || 1));
      const q = String(c.req.query("q") || "").trim();
      const placeTypeEarly = String(c.req.query("type") || "");
      if (placeTypeEarly === "gas_station") {
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
      const group = String(c.req.query("group") || "");
      const category = String(c.req.query("category") || "");
      const placeType = String(c.req.query("type") || "");
      const status = String(c.req.query("status") || "");
      let types: string[] | null = null;
      if (placeType) types = [placeType];
      else if (category || group) {
        let typeQuery = sb.from("place_type").select("slug, category_code");
        if (category) typeQuery = typeQuery.eq("category_code", category);
        const { data: typeRows, error: typeError } = await typeQuery;
        if (typeError) throw typeError;
        let rows = typeRows || [];
        if (group) {
          const { data: cats } = await sb.from("category").select("code").eq("group_code", group);
          const codes = new Set((cats || []).map((row) => row.code));
          rows = rows.filter((row) => codes.has(row.category_code));
        }
        types = rows.map((row) => row.slug);
        if (!types.length) return c.json({ rows: [], total: 0, page });
      }
      let query = sb.from("place").select("id,name,place_type,brand_id,lat,lng,address,plus_code,parish,status,pin_state,geofence_m,brand:brand_id(name),place_facility(facility_type)", { count: "exact" });
      if (types) query = query.in("place_type", types);
      if (status) query = query.eq("status", status);
      if (q) {
        const { data: aliasHits } = await sb.from("place_alias").select("place_id").ilike("normalized_value", `%${q.toLowerCase()}%`).limit(50);
        const { data: brandHits } = await sb.from("brand").select("id").ilike("name", `%${q}%`).limit(20);
        const ids = (aliasHits || []).map((row) => row.place_id).filter(Boolean);
        const brands = (brandHits || []).map((row) => row.id);
        const parts = [`name.ilike.%${q}%`, `address.ilike.%${q}%`, `plus_code.ilike.%${q}%`];
        if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
        if (brands.length) parts.push(`brand_id.in.(${brands.join(",")})`);
        query = query.or(parts.join(","));
      }
      const from = (page - 1) * PAGE;
      const { data, error, count } = await query.order("name").range(from, from + PAGE - 1);
      if (error) throw error;
      return c.json({ rows: data || [], total: count || 0, page });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load places" }, 400);
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
      return c.json({ error: err instanceof Error ? err.message : "Could not load place" }, 400);
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
      const { data: row, error } = await places(sb).from("place").select("id,name,place_type,lat,lng,status").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!row) return c.json({ error: "Place not found" }, 404);
      const missing = await missingChecklist(sb, row);
      if (missing.length) return c.json({ ok: false, missing }, 400);
      const { error: updateError } = await places(sb).from("place").update({
        status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: owner.id,
      }).eq("id", id);
      if (updateError) throw updateError;
      const { error: publishError } = await places(sb).rpc("refresh_public_place", { p_place_id: id });
      if (publishError) throw publishError;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not verify" }, 400);
    }
  });

  app.post("/admin/register/bulk", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const action = String(body.action || "");
      const sb = deps.admin();
      if (!ids.length) return c.json({ error: "Choose at least one place" }, 400);
      if (action === "type" && body.placeType) {
        const { error } = await places(sb).from("place").update({ place_type: String(body.placeType) }).in("id", ids);
        if (error) throw error;
      } else if (action === "add-facility" && body.facility) {
        for (const id of ids) {
          const { error } = await places(sb).from("place_facility").insert({ place_id: id, facility_type: String(body.facility), source: "admin" });
          if (error && !/duplicate|unique/i.test(error.message)) throw error;
        }
      } else if (action === "remove-facility" && body.facility) {
        const { error } = await places(sb).from("place_facility").delete().in("place_id", ids).eq("facility_type", String(body.facility));
        if (error) throw error;
      } else if (action === "set_brand") {
        const reason = body.reason ? String(body.reason) : null;
        for (const id of ids) {
          await applyRegisterUpdate(sb, id, { brand_id: body.brandId ? String(body.brandId) : null }, null, owner.id, reason);
        }
      } else if (action === "pin_confirmed") {
        const reason = body.reason ? String(body.reason) : null;
        for (const id of ids) {
          await applyRegisterUpdate(sb, id, { pin_state: "confirmed" }, null, owner.id, reason);
        }
      } else if (action === "duplicate_of") {
        if (!body.duplicateOf) return c.json({ error: "Choose the station to keep" }, 400);
        const reason = body.reason ? String(body.reason) : null;
        for (const id of ids) {
          if (id === String(body.duplicateOf)) continue;
          await applyRegisterUpdate(sb, id, { status: "duplicate", duplicate_of: String(body.duplicateOf) }, null, owner.id, reason);
        }
      } else if (action === "verify") {
        const blocked: string[] = [];
        for (const id of ids) {
          const { data: row } = await places(sb).from("place").select("id,name,place_type,lat,lng").eq("id", id).maybeSingle();
          if (!row) continue;
          const missing = await missingChecklist(sb, row);
          if (missing.length) blocked.push(id);
          else {
            await places(sb).from("place").update({ status: "verified", verified_at: new Date().toISOString(), verified_by: owner.id }).eq("id", id);
            await places(sb).rpc("refresh_public_place", { p_place_id: id });
          }
        }
        return c.json({ ok: true, blocked });
      } else {
        return c.json({ error: "That bulk action is not available" }, 400);
      }
      return c.json({ ok: true });
    } catch (err) {
      const refused = ownerRefusal(err, "Could not update places");
      return c.json({ error: refused.message }, refused.status);
    }
  });

  app.post("/admin/register/import", async (c) => {
    try {
      await deps.requireOwner(c);
      const body = await c.req.json();
      const rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : [];
      const sb = deps.admin();
      const { data: types } = await places(sb).from("place_type").select("slug");
      const { data: facilities } = await places(sb).from("facility_type").select("slug");
      const typeSet = new Set((types || []).map((row) => row.slug));
      const facilitySet = new Set((facilities || []).map((row) => row.slug));
      const rejected: { row: number; reason: string }[] = [];
      let saved = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const placeType = String(row.placeType || "").trim();
        if (!placeType || !typeSet.has(placeType)) {
          rejected.push({ row: index + 1, reason: placeType ? `Unknown place type ${placeType}` : "Place type is required" });
          continue;
        }
        const slugs = String(row.facilities || "").split("|").map((slug) => slug.trim()).filter(Boolean);
        const unknown = slugs.find((slug) => !facilitySet.has(slug));
        if (unknown) {
          rejected.push({ row: index + 1, reason: `Unknown facility ${unknown}` });
          continue;
        }
        if (!String(row.name || "").trim() || row.lat == null || row.lng == null) {
          rejected.push({ row: index + 1, reason: "Name and pin are required" });
          continue;
        }
        await savePlace(sb, null, null, { ...row, placeType, facilities: slugs, verify: false });
        saved += 1;
      }
      return c.json({ saved, rejected });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not import" }, 400);
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

  app.patch("/admin/taxonomy/:table/:id", async (c) => {
    try {
      await deps.requireOwner(c);
      const table = c.req.param("table");
      const id = c.req.param("id");
      const body = await c.req.json();
      const allowed = new Set(["category_group", "category", "place_type", "facility_type", "brand"]);
      if (!allowed.has(table)) return c.json({ error: "That list cannot be edited" }, 400);
      const sb = places(deps.admin());
      if (body.retire === true) {
        if (table === "category_group" || table === "brand" || table === "category" || table === "place_type" || table === "facility_type") {
          const key = table === "category" || table === "category_group" ? "code" : table === "brand" ? "id" : "slug";
          const { error } = await sb.from(table).update({ active: false }).eq(key, id);
          if (error) throw error;
          return c.json({ ok: true });
        }
      }
      const patch: Record<string, unknown> = {};
      for (const key of ["label", "colour", "attribute_schema", "default_geofence_m", "name", "aliases"]) {
        if (key in body) patch[key] = body[key];
      }
      if (!Object.keys(patch).length) return c.json({ error: "Nothing to change" }, 400);
      const key = table === "category" || table === "category_group" ? "code" : table === "brand" ? "id" : "slug";
      const { error } = await sb.from(table).update(patch).eq(key, id);
      if (error) throw error;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not update the list" }, 400);
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
    const patch = placePatchFromBody(body);
    const facilities = Array.isArray(body.facilities) ? body.facilities : null;
    const addAlias = body.addAlias && typeof body.addAlias === "object" ? body.addAlias as Record<string, unknown> : null;
    const removeAlias = body.removeAliasId ? String(body.removeAliasId) : null;
    if (!Object.keys(patch).length && facilities == null && !addAlias && !removeAlias) {
      throw new Error("Nothing to change");
    }
    await applyRegisterUpdate(sb, id, patch, facilities, ownerId, reason, { addAlias, removeAlias });
    if (body.verify === true) {
      const { data: current } = await places(sb).from("place").select("id,name,place_type,lat,lng").eq("id", id).single();
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
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!placeType || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Type, name, and pin are required");
  }
  const row = {
    place_type: placeType,
    name,
    lat,
    lng,
    address: body.address ? String(body.address) : null,
    parish: body.parish ? String(body.parish) : null,
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
    const { data: current } = await db.from("place").select("id,name,place_type,lat,lng").eq("id", placeId).single();
    const missing = await missingChecklist(sb, current || {});
    if (missing.length) return { id: placeId, ok: false, missing };
    await applyRegisterUpdate(sb, placeId, { status: "verified", verified_at: new Date().toISOString() }, null, ownerId, reason || "verified");
    await db.rpc("refresh_public_place", { p_place_id: placeId });
  }
  return { id: placeId, ok: true };
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
