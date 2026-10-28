import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Owner = { id: string };
type Ctx = { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined; param: (name: string) => string; json: () => Promise<Record<string, unknown>> } };

const PAGE = 50;

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

export function registerPlaceAdmin(
  app: Hono,
  deps: { admin: () => SupabaseClient; requireOwner: (c: any) => Promise<Owner> },
) {
  app.get("/admin/taxonomy", async (c) => {
    try {
      await deps.requireOwner(c);
      const { data, error } = await places(deps.admin()).rpc("taxonomy");
      if (error) throw error;
      return c.json(data || {});
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load categories" }, 403);
    }
  });

  app.get("/admin/register/nearby", async (c) => {
    try {
      await deps.requireOwner(c);
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
      await deps.requireOwner(c);
      const sb = places(deps.admin());
      const page = Math.max(1, Number(c.req.query("page") || 1));
      const q = String(c.req.query("q") || "").trim();
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
      await deps.requireOwner(c);
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
      const [{ data: evidence }, historyResult, { data: prices }, { data: publicRow }] = await Promise.all([
        places(sb).from("place_evidence").select("id, kind, created_at").eq("place_id", id).order("created_at", { ascending: false }).limit(20),
        sb.schema("fleet").from("master_change_log").select("action, reason, actor, created_at").eq("dataset", "place").eq("record_id", id).order("created_at", { ascending: false }).limit(20),
        places(sb).from("price_current").select("grade, price_per_litre, updated_at").eq("place_id", id),
        places(sb).from("public_place").select("id").eq("id", id).maybeSingle(),
      ]);
      return c.json({
        place: data,
        evidence: evidence || [],
        history: historyResult.error ? [] : (historyResult.data || []),
        prices: prices || [],
        public: Boolean(publicRow),
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
      return c.json({ error: err instanceof Error ? err.message : "Could not save place" }, 400);
    }
  });

  app.patch("/admin/register/:id", async (c) => {
    try {
      const owner = await deps.requireOwner(c as unknown as Ctx);
      const body = await c.req.json();
      const saved = await savePlace(deps.admin(), owner.id, c.req.param("id"), body);
      return c.json(saved);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not save place" }, 400);
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
      return c.json({ error: err instanceof Error ? err.message : "Could not update places" }, 400);
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
      if (!chip || chip === "evidence") {
        const { data, error } = await places(sb).from("place_evidence").select("id,place_id,note,origin_app,accuracy_m,created_at").order("created_at", { ascending: false }).limit(50);
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

async function savePlace(sb: SupabaseClient, _ownerId: string | null, id: string | null, body: Record<string, unknown>) {
  if (id && body.duplicateOf) {
    const { error } = await places(sb).from("place").update({
      status: "duplicate",
      duplicate_of: String(body.duplicateOf),
    }).eq("id", id);
    if (error) throw error;
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
  const saved = id
    ? await db.from("place").update(row).eq("id", id).select("id").single()
    : await db.from("place").insert({ ...row, status: "pending", origin_app: "manual" }).select("id").single();
  if (saved.error) throw saved.error;
  const placeId = String(saved.data.id);
  if (Array.isArray(body.facilities)) {
    await db.from("place_facility").delete().eq("place_id", placeId);
    const facilities = (body.facilities as Array<Record<string, unknown> | string>).map((item) => {
      if (typeof item === "string") return { place_id: placeId, facility_type: item, source: "admin", attributes: {}, label: null };
      return {
        place_id: placeId,
        facility_type: String(item.type || item.facility_type),
        label: item.label ? String(item.label) : null,
        attributes: (item.attributes as Record<string, unknown>) || {},
        source: "admin",
      };
    }).filter((item) => item.facility_type);
    if (facilities.length) {
      const { error } = await db.from("place_facility").insert(facilities);
      if (error) throw error;
    }
  }
  if (body.verify === true) {
    const { data: current } = await db.from("place").select("id,name,place_type,lat,lng").eq("id", placeId).single();
    const missing = await missingChecklist(sb, current || {});
    if (missing.length) return { id: placeId, ok: false, missing };
    await db.from("place").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", placeId);
    await db.rpc("refresh_public_place", { p_place_id: placeId });
  }
  return { id: placeId, ok: true };
}
