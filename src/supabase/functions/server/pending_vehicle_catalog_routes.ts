/** Pending vehicle catalog queue - admin approval routes. */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { executeMaintenanceBootstrap } from "./maintenance_bootstrap_core.ts";
import { canonicalOdometerForVehicle } from "./canonical_vehicle_odometer.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import {
  catalogRowForApi,
  insertRowForLegacyDb,
  isLegacyVehicleCatalogYearNotNullError,
  isPostgrestVehicleCatalogSchemaCacheError,
  isVehicleCatalogSchemaMismatchError,
  mergeCatalogTrimIntoTrimSeriesInPlace,
  parseMissingColumnFromVehicleCatalogDbError,
  shouldStripVehicleCatalogInsertPayloadOnRetry,
  stripVehicleCatalogOptionalMigrationColumns,
  VEHICLE_CATALOG_SUPABASE_SELECT,
} from "./vehicle_catalog_schema_fallback.ts";
import { filterCatalogRowsByFleetMonth, type CatalogVariantRow } from "../../../utils/vehicleCatalogResolution.ts";
import { parseCatalogMonthFromUnknown } from "../../../utils/catalogMonthParse.ts";

const KEYS = [
  "make", "model", "production_start_year", "production_end_year", "production_start_month", "production_end_month",
  "trim_series", "generation",
  "full_model_code", "catalog_trim", "emissions_prefix", "trim_suffix_code",
  "chassis_code", "generation_code", "engine_code", "engine_type",
  "body_type", "doors", "length_mm", "width_mm", "height_mm", "wheelbase_mm", "ground_clearance_mm",
  "engine_displacement_l", "engine_displacement_cc", "engine_configuration", "fuel_category", "fuel_type", "fuel_grade", "transmission", "drivetrain",
  "horsepower", "torque", "torque_unit",
  "fuel_tank_capacity", "fuel_tank_unit", "fuel_economy_km_per_l", "estimated_km_per_refuel",
  "seating_capacity", "curb_weight_kg", "gross_vehicle_weight_kg", "max_payload_kg", "max_towing_kg",
  "front_brake_type", "rear_brake_type", "brake_size_mm",
  "tire_size", "bolt_pattern", "wheel_offset_mm",
  "engine_oil_capacity_l", "coolant_capacity_l",
] as const;

function assertCatalogSpan(start: number, end: number | null): string | null {
  if (end != null && end < start) return "production_end_year must be >= production_start_year";
  return null;
}

const MAX_ENGINE_TYPE_LEN = 200;

function validateEngineType(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (s.length > MAX_ENGINE_TYPE_LEN) {
    return `engine_type must be at most ${MAX_ENGINE_TYPE_LEN} characters`;
  }
  return null;
}

function parseOptionalProductionMonth(
  raw: unknown,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  return parseCatalogMonthFromUnknown(raw, label);
}

const OPEN_STATUSES = ["pending", "needs_info"] as const;

function assertPlatformVehicle(c: Context) {
  const u = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
  const r = u?.resolvedRole || u?.role;
  if (r !== "platform_owner" && r !== "superadmin" && r !== "platform_support") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}

function pickRow(raw: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === undefined) continue;
    if (partial) {
      if (v === "") continue;
      out[k] = v;
    } else {
      if (v === null) continue;
      if (v === "" && k !== "make" && k !== "model") continue;
      out[k] = v;
    }
  }
  return out;
}

/** Catalog columns seeded from pending row when approve body omits them. */
function pendingCatalogFieldDefaults(pr: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pairs: [string, string][] = [
    ["trim_series", "proposed_trim_series"],
    ["body_type", "proposed_body_type"],
    ["engine_code", "proposed_engine_code"],
    ["full_model_code", "proposed_full_model_code"],
    ["catalog_trim", "proposed_catalog_trim"],
    ["emissions_prefix", "proposed_emissions_prefix"],
    ["trim_suffix_code", "proposed_trim_suffix_code"],
    ["fuel_category", "proposed_fuel_category"],
    ["fuel_grade", "proposed_fuel_grade"],
  ];
  for (const [k, pk] of pairs) {
    const v = pr[pk];
    if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = v;
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FACET_PAGE = 1000;
const FACET_MAX_OFFSET = 50_000;
/** Max calendar years expanded per catalog row when production_end_year is null (ongoing). */
const FACET_YEAR_FORWARD_SPAN = 35;

function collectFacetCalendarYears(rows: Record<string, unknown>[]): number[] {
  const set = new Set<number>();
  const nowY = new Date().getFullYear();
  const capHigh = nowY + 1;
  for (const row of rows) {
    let y0 = Number(row.production_start_year);
    let y1Raw: number | null = null;
    if (row.production_end_year !== undefined && row.production_end_year !== null && row.production_end_year !== "") {
      const e = Number(row.production_end_year);
      if (Number.isFinite(e)) y1Raw = e;
    }
    if (!Number.isFinite(y0) || y0 < 1900) {
      const legacy = Number((row as { year?: unknown }).year);
      if (Number.isFinite(legacy) && legacy >= 1900) {
        y0 = legacy;
        y1Raw = legacy;
      } else {
        continue;
      }
    }
    let hi: number;
    if (y1Raw != null && Number.isFinite(y1Raw)) {
      hi = Math.min(y1Raw, y0 + FACET_YEAR_FORWARD_SPAN);
    } else {
      hi = Math.min(capHigh, y0 + FACET_YEAR_FORWARD_SPAN);
    }
    if (hi < y0) hi = y0;
    for (let y = y0; y <= hi; y++) {
      if (y >= 1900 && y <= capHigh) set.add(y);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function registerPendingVehicleCatalogRoutes(
  app: { get: unknown; post: unknown },
  supabase: SupabaseClient,
) {
  const route = app as {
    get: (path: string, ...handlers: unknown[]) => void;
    post: (path: string, ...handlers: unknown[]) => void;
  };

  /**
   * Distinct make / model / calendar-year values from `vehicle_catalog` for
   * fleet UIs (align modal). Same permission as matches; does not expose full
   * rows—only facet strings for dropdowns.
   */
  route.get(
    "/make-server-37f42386/vehicle-catalog-facets",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const level = (c.req.query("level") ?? "").trim().toLowerCase();
        const make = (c.req.query("make") ?? "").trim();
        const model = (c.req.query("model") ?? "").trim();

        if (level === "make") {
          const makes = new Set<string>();
          let from = 0;
          for (;;) {
            const { data, error } = await supabase.from("vehicle_catalog").select("make").range(from, from + FACET_PAGE - 1);
            if (error) throw error;
            if (!data?.length) break;
            for (const r of data) {
              const m = String((r as { make?: unknown }).make ?? "").trim();
              if (m.length >= 1) makes.add(m);
            }
            if (data.length < FACET_PAGE) break;
            from += FACET_PAGE;
            if (from > FACET_MAX_OFFSET) break;
          }
          const list = Array.from(makes).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
          return c.json({ makes: list });
        }

        if (level === "model") {
          if (make.length < 2) return c.json({ error: "make is required (min 2 characters)" }, 400);
          const models = new Set<string>();
          let from = 0;
          for (;;) {
            const { data, error } = await supabase
              .from("vehicle_catalog")
              .select("model")
              .ilike("make", `%${make}%`)
              .range(from, from + FACET_PAGE - 1);
            if (error) throw error;
            if (!data?.length) break;
            for (const r of data) {
              const m = String((r as { model?: unknown }).model ?? "").trim();
              if (m.length >= 1) models.add(m);
            }
            if (data.length < FACET_PAGE) break;
            from += FACET_PAGE;
            if (from > FACET_MAX_OFFSET) break;
          }
          const list = Array.from(models).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
          return c.json({ models: list });
        }

        if (level === "year") {
          if (make.length < 2 || model.length < 2) {
            return c.json({ error: "make and model are required (min 2 characters each)" }, 400);
          }
          const acc: Record<string, unknown>[] = [];
          let from = 0;
          for (;;) {
            const { data, error } = await supabase
              .from("vehicle_catalog")
              .select("*")
              .ilike("make", `%${make}%`)
              .ilike("model", `%${model}%`)
              .range(from, from + FACET_PAGE - 1);
            if (error) throw error;
            if (!data?.length) break;
            acc.push(...(data as Record<string, unknown>[]));
            if (data.length < FACET_PAGE) break;
            from += FACET_PAGE;
            if (from > FACET_MAX_OFFSET) break;
          }
          const years = collectFacetCalendarYears(acc);
          return c.json({ years });
        }

        return c.json({ error: "Invalid level (use make, model, or year)" }, 400);
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/vehicle-catalog-matches",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const make = (c.req.query("make") ?? "").trim();
        const model = (c.req.query("model") ?? "").trim();
        const yearQ = c.req.query("year");
        const trimQ = (c.req.query("trim_series") ?? "").trim();
        const chassisQ = (c.req.query("chassis_code") ?? "").trim();
        const bodyQ = (c.req.query("body_type") ?? "").trim();
        const monthQ = (c.req.query("month") ?? "").trim();
        // Hybrid catalog matching: extra disambiguators sent by
        // CatalogVariantPicker so we get a precise candidate list at create time.
        const drivetrainQ = (c.req.query("drivetrain") ?? "").trim();
        const transmissionQ = (c.req.query("transmission") ?? "").trim();
        const fuelTypeQ = (c.req.query("fuel_type") ?? "").trim();
        const fuelGradeQ = (c.req.query("fuel_grade") ?? "").trim();
        const engineCodeQ = (c.req.query("engine_code") ?? "").trim();
        const engineTypeQ = (c.req.query("engine_type") ?? "").trim();
        const catalogTrimQ = (c.req.query("catalog_trim") ?? "").trim();
        const fullModelCodeQ = (c.req.query("full_model_code") ?? "").trim();
        const fleetMonth = monthQ === "" ? null : parseInt(monthQ, 10);
        const monthFilter =
          fleetMonth != null && Number.isFinite(fleetMonth) && fleetMonth >= 1 && fleetMonth <= 12
            ? fleetMonth
            : null;

        const buildMatchesQuery = (useLegacyYear: boolean) => {
          let q = supabase.from("vehicle_catalog").select("*").limit(40);
          if (yearQ != null && yearQ !== "") {
            const y = parseInt(yearQ, 10);
            if (Number.isFinite(y)) {
              if (useLegacyYear) q = q.eq("year", y);
              else q = q.lte("production_start_year", y).or(`production_end_year.is.null,production_end_year.gte.${y}`);
            }
          }
          if (make.length >= 2) q = q.ilike("make", `%${make}%`);
          if (model.length >= 2) q = q.ilike("model", `%${model}%`);
          if (trimQ.length >= 1) q = q.ilike("trim_series", `%${trimQ}%`);
          if (chassisQ.length >= 1) {
            if (useLegacyYear) q = q.ilike("generation_code", `%${chassisQ}%`);
            else q = q.ilike("chassis_code", `%${chassisQ}%`);
          }
          if (bodyQ.length >= 1) q = q.ilike("body_type", `%${bodyQ}%`);
          if (drivetrainQ.length >= 1) q = q.ilike("drivetrain", `%${drivetrainQ}%`);
          if (transmissionQ.length >= 1) q = q.ilike("transmission", `%${transmissionQ}%`);
          if (fuelTypeQ.length >= 1) q = q.ilike("fuel_type", `%${fuelTypeQ}%`);
          if (fuelGradeQ.length >= 1) q = q.ilike("fuel_grade", `%${fuelGradeQ}%`);
          if (engineCodeQ.length >= 1) q = q.ilike("engine_code", `%${engineCodeQ}%`);
          if (engineTypeQ.length >= 1) q = q.ilike("engine_type", `%${engineTypeQ}%`);
          if (catalogTrimQ.length >= 1) q = q.ilike("catalog_trim", `%${catalogTrimQ}%`);
          if (fullModelCodeQ.length >= 1) q = q.ilike("full_model_code", `%${fullModelCodeQ}%`);
          return q.order("make").order("model");
        };

        let { data, error } = await buildMatchesQuery(false);
        if (error && isVehicleCatalogSchemaMismatchError(error)) {
          const r2 = await buildMatchesQuery(true);
          data = r2.data;
          error = r2.error;
        }
        if (error) {
          // Some optional disambiguator columns may not exist on legacy schemas;
          // re-run without them so we still return useful candidates instead of
          // 500ing the picker. The narrowing is done client-side in that case.
          if (drivetrainQ || transmissionQ || fuelTypeQ || fuelGradeQ || engineCodeQ || engineTypeQ || catalogTrimQ || fullModelCodeQ) {
            console.warn("[vehicle-catalog-matches] disambiguator filter failed, retrying without optional cols:", error.message);
            const fallback = await supabase
              .from("vehicle_catalog")
              .select("*")
              .limit(40)
              .ilike("make", make.length >= 2 ? `%${make}%` : "%")
              .ilike("model", model.length >= 2 ? `%${model}%` : "%")
              .order("make")
              .order("model");
            if (fallback.error) throw fallback.error;
            data = fallback.data;
          } else {
            throw error;
          }
        }
        let rows = data || [];
        if (monthFilter != null && yearQ != null && yearQ !== "") {
          const y = parseInt(yearQ, 10);
          if (Number.isFinite(y)) {
            const mapped = rows.map((raw) => {
              const row = raw as Record<string, unknown>;
              if (row.production_start_year != null) return row as CatalogVariantRow;
              const yn = Number(row.year);
              if (!Number.isFinite(yn)) return row as CatalogVariantRow;
              return {
                ...row,
                production_start_year: yn,
                production_start_month: null,
                production_end_year: yn,
                production_end_month: null,
              } as CatalogVariantRow;
            });
            const filtered = filterCatalogRowsByFleetMonth(mapped, y, monthFilter);
            rows = filtered.length > 0 ? filtered : mapped;
          }
        }
        const items = rows.map((row) => catalogRowForApi(row as Record<string, unknown>));
        // exactCount = items.length capped at 40 (the SELECT limit). Picker uses
        // this to decide auto-match (1) vs force-pick (>=2) vs no-match (0).
        return c.json({ items, exactCount: items.length, truncated: items.length === 40 });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  /** Tenant-safe read: only when org has a fleet vehicle linked to this catalog id (or platform role). */
  route.get(
    "/make-server-37f42386/fleet/vehicle-catalog/:catalogId",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const catalogId = c.req.param("catalogId")?.trim() ?? "";
        if (!UUID_RE.test(catalogId)) return c.json({ error: "Invalid catalog id" }, 400);

        const u = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
        const r = u?.resolvedRole || u?.role;
        const platformRead =
          r === "platform_owner" || r === "superadmin" || r === "platform_support" || r === "platform_analyst";

        if (!platformRead) {
          const orgId = getOrgId(c);
          if (!orgId) return c.json({ error: "Organization required" }, 403);
          const vehiclesRaw = await kv.getByPrefix("vehicle:");
          const list = Array.isArray(vehiclesRaw) ? vehiclesRaw : [];
          const scoped = filterByOrg(list as Record<string, unknown>[], c);
          const hasLink = scoped.some(
            (v) => String((v as { vehicle_catalog_id?: string }).vehicle_catalog_id ?? "") === catalogId,
          );
          if (!hasLink) return c.json({ error: "Forbidden" }, 403);
        }

        const { data, error } = await supabase.from("vehicle_catalog").select("*").eq("id", catalogId).maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: catalogRowForApi(data as Record<string, unknown>) });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/vehicle-catalog-pending/my",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) {
          return c.json({ error: "Organization required" }, 403);
        }
        const fleetVid = (c.req.query("fleet_vehicle_id") ?? "").trim();
        let q = supabase
          .from("vehicle_catalog_pending_requests")
          .select("*")
          .eq("organization_id", orgId)
          .in("status", [...OPEN_STATUSES]);
        if (fleetVid && UUID_RE.test(fleetVid)) {
          q = q.eq("fleet_vehicle_id", fleetVid);
        }
        const { data, error } = await q.order("updated_at", { ascending: false });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const status = (c.req.query("status") ?? "open").trim();
        const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
        const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
        let q = supabase.from("vehicle_catalog_pending_requests").select("*", { count: "exact" });
        if (status === "open") {
          q = q.in("status", [...OPEN_STATUSES]);
        } else if (["pending", "needs_info", "approved", "rejected", "superseded"].includes(status)) {
          q = q.eq("status", status);
        }
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        return c.json({ items: data || [], total: count ?? 0 });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests/:id",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const id = c.req.param("id")?.trim() ?? "";
        if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);
        const { data: row, error } = await supabase.from("vehicle_catalog_pending_requests").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!row) return c.json({ error: "Not found" }, 404);
        const fleetId = String((row as { fleet_vehicle_id?: string }).fleet_vehicle_id ?? "");
        const rawVehicle = fleetId ? await kv.get(`vehicle:${fleetId}`) : null;
        return c.json({ item: row, fleetVehicle: rawVehicle && typeof rawVehicle === "object" ? rawVehicle : null });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests/:id/request-info",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const id = c.req.param("id")?.trim() ?? "";
        if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as { message?: string };
        const msg = String(body.message ?? "").trim();
        if (!msg) return c.json({ error: "message is required" }, 400);
        const rbacUser = c.get("rbacUser") as { id?: string; userId?: string } | undefined;
        const by = rbacUser?.id ?? rbacUser?.userId ?? null;
        const { data: updated, error } = await supabase
          .from("vehicle_catalog_pending_requests")
          .update({
            status: "needs_info",
            info_request_message: msg.slice(0, 2000),
            info_requested_at: new Date().toISOString(),
            info_requested_by: by,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", ["pending", "needs_info"])
          .select("fleet_vehicle_id")
          .maybeSingle();
        if (error) throw error;
        // Mirror the change onto the KV vehicle so the customer UI flips its
        // banner from "Pending" to "Needs info" without an extra round trip.
        const fleetVid = String((updated as { fleet_vehicle_id?: string } | null)?.fleet_vehicle_id ?? "");
        if (fleetVid) {
          try {
            const raw = await kv.get(`vehicle:${fleetVid}`);
            if (raw && typeof raw === "object") {
              await kv.set(`vehicle:${fleetVid}`, {
                ...(raw as Record<string, unknown>),
                catalogStatus: "needs_info",
              });
            }
          } catch (kvErr) {
            console.warn("[catalog-pending] needs_info KV mirror failed", kvErr);
          }
        }
        return c.json({ success: true });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests/:id/reject",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const id = c.req.param("id")?.trim() ?? "";
        if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
        const rbacUser = c.get("rbacUser") as { id?: string; userId?: string } | undefined;
        const resolvedBy = rbacUser?.id ?? rbacUser?.userId ?? null;
        const { error } = await supabase
          .from("vehicle_catalog_pending_requests")
          .update({
            status: "rejected",
            rejection_reason: body.reason != null ? String(body.reason).slice(0, 2000) : null,
            resolved_at: new Date().toISOString(),
            resolved_by: resolvedBy,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", [...OPEN_STATUSES]);
        if (error) throw error;
        return c.json({ success: true });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests/:id/approve-existing",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const id = c.req.param("id")?.trim() ?? "";
        if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as { existing_catalog_id?: string };
        const existingId = String(body.existing_catalog_id ?? "").trim();
        if (!UUID_RE.test(existingId)) return c.json({ error: "existing_catalog_id required" }, 400);

        const { data: reqRow, error: rErr } = await supabase
          .from("vehicle_catalog_pending_requests")
          .select("*")
          .eq("id", id)
          .in("status", [...OPEN_STATUSES])
          .maybeSingle();
        if (rErr) throw rErr;
        if (!reqRow) return c.json({ error: "Pending request not found" }, 404);

        const fleetId = String((reqRow as { fleet_vehicle_id: string }).fleet_vehicle_id);
        const raw = await kv.get(`vehicle:${fleetId}`);
        if (!raw || typeof raw !== "object") return c.json({ error: "Fleet vehicle not found" }, 404);
        // The platform admin has linked an existing catalog row — flip the
        // fleet vehicle out of the parked state. We deliberately leave
        // `status` alone so the operator decides when to set Active.
        const vehicle = {
          ...(raw as Record<string, unknown>),
          vehicle_catalog_id: existingId,
          catalogStatus: "matched",
        };
        await kv.set(`vehicle:${fleetId}`, vehicle);

        const rbacUser = c.get("rbacUser") as { id?: string; userId?: string } | undefined;
        await supabase
          .from("vehicle_catalog_pending_requests")
          .update({
            status: "approved",
            resolved_vehicle_catalog_id: existingId,
            resolved_at: new Date().toISOString(),
            resolved_by: rbacUser?.id ?? rbacUser?.userId ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        const orgId = String((vehicle as { organizationId?: string }).organizationId ?? "");
        const metricsBase = Number((vehicle.metrics as { odometer?: number })?.odometer ?? 0) || 0;
        const currentOdo = await canonicalOdometerForVehicle(supabase, fleetId, metricsBase, c);
        const run = await executeMaintenanceBootstrap({
          supabase,
          organizationId: orgId,
          vehicleId: fleetId,
          currentOdo,
          catalogId: existingId,
        });

        return c.json({ success: true, vehicle_catalog_id: existingId, catalogStatus: "matched", bootstrap: run });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-catalog-pending-requests/:id/approve",
    requireAuth(),
    async (c) => {
      const denied = assertPlatformVehicle(c);
      if (denied) return denied;
      try {
        const id = c.req.param("id")?.trim() ?? "";
        if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: reqRow, error: rErr } = await supabase
          .from("vehicle_catalog_pending_requests")
          .select("*")
          .eq("id", id)
          .in("status", [...OPEN_STATUSES])
          .maybeSingle();
        if (rErr) throw rErr;
        if (!reqRow) return c.json({ error: "Pending request not found" }, 404);

        const pr = reqRow as {
          fleet_vehicle_id: string;
          proposed_make: string;
          proposed_model: string;
          proposed_production_start_year: number;
          proposed_production_end_year: number | null;
          proposed_production_start_month?: number | null;
          proposed_production_end_month?: number | null;
        };
        const make = String(body.make ?? pr.proposed_make).trim();
        const model = String(body.model ?? pr.proposed_model).trim();
        const startNum =
          body.production_start_year !== undefined && body.production_start_year !== null
            ? Number(body.production_start_year)
            : pr.proposed_production_start_year;
        let endNum: number | null;
        if ("production_end_year" in body) {
          if (body.production_end_year === null || body.production_end_year === "") {
            endNum = null;
          } else {
            const e = Number(body.production_end_year);
            if (!Number.isFinite(e) || e < 1900 || e > 2100) {
              return c.json({ error: "production_end_year must be between 1900 and 2100, or empty for ongoing" }, 400);
            }
            endNum = e;
          }
        } else {
          endNum = pr.proposed_production_end_year ?? null;
        }
        if (!make || !model || !Number.isFinite(startNum) || startNum < 1900 || startNum > 2100) {
          return c.json({ error: "make, model, and valid production_start_year required" }, 400);
        }
        const spanErr = assertCatalogSpan(startNum, endNum);
        if (spanErr) return c.json({ error: spanErr }, 400);

        let startMonth: number | null;
        if ("production_start_month" in body) {
          const p = parseOptionalProductionMonth(body.production_start_month, "production_start_month");
          if (!p.ok) return c.json({ error: p.error }, 400);
          startMonth = p.value;
        } else {
          startMonth = pr.proposed_production_start_month ?? null;
        }
        let endMonth: number | null;
        if ("production_end_month" in body) {
          const p = parseOptionalProductionMonth(body.production_end_month, "production_end_month");
          if (!p.ok) return c.json({ error: p.error }, 400);
          endMonth = p.value;
        } else {
          endMonth = pr.proposed_production_end_month ?? null;
        }
        if (endNum == null && endMonth != null) {
          return c.json({ error: "production_end_month must be empty when production is ongoing" }, 400);
        }
        const eiErr = validateEngineType(body.engine_type);
        if (eiErr) return c.json({ error: eiErr }, 400);

        const row = pickRow(
          {
            ...pendingCatalogFieldDefaults(reqRow as Record<string, unknown>),
            ...body,
            make,
            model,
            production_start_year: startNum,
            production_end_year: endNum,
            production_start_month: startMonth,
            production_end_month: endMonth,
          },
          false,
        );
        if (row.engine_type !== undefined && row.engine_type !== null && row.engine_type !== "") {
          row.engine_type = String(row.engine_type).trim();
        }
        const rowRec = row as Record<string, unknown>;
        if (
          rowRec.chassis_code != null &&
          rowRec.chassis_code !== "" &&
          (rowRec.generation_code == null || rowRec.generation_code === "")
        ) {
          rowRec.generation_code = rowRec.chassis_code;
        }
        row.updated_at = new Date().toISOString();
        const rpcIns = await supabase.rpc("edge_insert_vehicle_catalog_row", { p: rowRec });
        let ins =
          !rpcIns.error && rpcIns.data != null
            ? { data: rpcIns.data as Record<string, unknown>, error: null as typeof rpcIns.error }
            : await supabase.from("vehicle_catalog").insert(row).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
        if (ins.error && isLegacyVehicleCatalogYearNotNullError(ins.error)) {
          const legacyRow = insertRowForLegacyDb(
            stripVehicleCatalogOptionalMigrationColumns(row as Record<string, unknown>),
          );
          legacyRow.updated_at = row.updated_at;
          ins = await supabase.from("vehicle_catalog").insert(legacyRow).select("*").single();
        } else if (ins.error && isPostgrestVehicleCatalogSchemaCacheError(ins.error)) {
          const rpc = await supabase.rpc("edge_insert_vehicle_catalog_row", { p: rowRec });
          if (!rpc.error && rpc.data != null) {
            ins = { data: rpc.data as Record<string, unknown>, error: null };
          }
        }
        if (!ins.error) {
          /* success */
        } else {
          let candidate: Record<string, unknown> = { ...(row as Record<string, unknown>) };
          for (
            let i = 0;
            ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error) && i < 48;
            i++
          ) {
            const missing = parseMissingColumnFromVehicleCatalogDbError(ins.error);
            if (!missing || !(missing in candidate)) break;
            if (missing === "catalog_trim") mergeCatalogTrimIntoTrimSeriesInPlace(candidate);
            delete candidate[missing];
            candidate.updated_at = row.updated_at;
            ins = await supabase.from("vehicle_catalog").insert(candidate).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
          }
          if (ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error)) {
            const trimmed = stripVehicleCatalogOptionalMigrationColumns(candidate);
            trimmed.updated_at = row.updated_at;
            ins = await supabase.from("vehicle_catalog").insert(trimmed).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
          }
          if (ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error)) {
            const legacyRow = insertRowForLegacyDb(
              stripVehicleCatalogOptionalMigrationColumns(candidate),
            );
            legacyRow.updated_at = row.updated_at;
            ins = await supabase.from("vehicle_catalog").insert(legacyRow).select("*").single();
          }
        }
        if (ins.error) throw ins.error;
        const catRow = ins.data;
        const catalogId = String((catRow as { id: string }).id);

        const fleetId = pr.fleet_vehicle_id;
        const raw = await kv.get(`vehicle:${fleetId}`);
        if (!raw || typeof raw !== "object") return c.json({ error: "Fleet vehicle not found" }, 404);
        // Fresh catalog row was just created — flip the fleet vehicle out of
        // the parked state. Operational `status` is left to the operator.
        const vehicle = {
          ...(raw as Record<string, unknown>),
          vehicle_catalog_id: catalogId,
          catalogStatus: "matched",
        };
        await kv.set(`vehicle:${fleetId}`, vehicle);

        const rbacUser = c.get("rbacUser") as { id?: string; userId?: string } | undefined;
        await supabase
          .from("vehicle_catalog_pending_requests")
          .update({
            status: "approved",
            resolved_vehicle_catalog_id: catalogId,
            resolved_at: new Date().toISOString(),
            resolved_by: rbacUser?.id ?? rbacUser?.userId ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        const orgId = String((vehicle as { organizationId?: string }).organizationId ?? "");
        const metricsBase = Number((vehicle.metrics as { odometer?: number })?.odometer ?? 0) || 0;
        const currentOdo = await canonicalOdometerForVehicle(supabase, fleetId, metricsBase, c);
        const run = await executeMaintenanceBootstrap({
          supabase,
          organizationId: orgId,
          vehicleId: fleetId,
          currentOdo,
          catalogId,
        });

        return c.json({
          success: true,
          item: catalogRowForApi((catRow ?? {}) as Record<string, unknown>),
          catalogStatus: "matched",
          bootstrap: run,
        });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );
}
