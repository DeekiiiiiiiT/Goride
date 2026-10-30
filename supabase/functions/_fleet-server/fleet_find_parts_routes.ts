/**
 * Fleet Find parts routes. The search itself is parts_finder.ts.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";
import { findParts } from "./parts_finder.ts";
import { readPartTerm, readPartsBrowse, readSymptoms } from "./parts_catalog_read.ts";
import { canonicalOdometerForVehicle } from "./canonical_vehicle_odometer.ts";
import { analyzeMaintenanceScheduleRow } from "../../../packages/finance-core/src/maintenanceOverdueDetails.ts";
import { upsertPendingFromKvVehicle } from "./vehicle_catalog_pending_queries.ts";

const PREFIX = "/make-server-37f42386/parts";
const PHOTO_BUCKET = "parts-request-photos";
const URGENCY = new Set(["low", "normal", "urgent"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function quoteInputError(body: Record<string, unknown>): string | null {
  const qty = body.qty != null && body.qty !== "" ? Number(body.qty) : 1;
  if (!Number.isFinite(qty) || qty <= 0) return "Quantity must be at least 1";
  const urgency = body.urgency ? String(body.urgency) : "";
  if (urgency && !URGENCY.has(urgency)) return "Urgency must be low, normal, or urgent";
  const note = body.note ? String(body.note) : "";
  if (note.length > 140) return "Note is limited to 140 characters";
  return null;
}

/** True only when the folder is this org's, or the caller left it blank. */
export function photoFolderAllowed(orgId: string, folder: string): boolean {
  const clean = folder.replace(/^\/+|\/+$/g, "");
  if (!clean) return true;
  return clean === orgId || clean.startsWith(`${orgId}/`);
}

export function sourcingRow(input: {
  orgId: string;
  vehicleId: string | null;
  needText: string;
  componentId: string | null;
  engineFamilyId: string | null;
}) {
  return {
    organization_id: input.orgId,
    vehicle_id: input.vehicleId,
    need_text: input.needText,
    maintenance_component_id: input.componentId,
    engine_family_id: input.engineFamilyId,
    status: "open",
  };
}

export function vehicleContextStatus(foundInKv: boolean, inOrg: boolean): 200 | 403 | 404 {
  if (!foundInKv) return 404;
  if (!inOrg) return 403;
  return 200;
}

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
};

async function ownVehicle(c: Context, vehicleId: string) {
  const raw = await kv.get(`vehicle:${vehicleId}`);
  const found = Boolean(raw && typeof raw === "object");
  const scoped = found ? filterByOrg([raw as Record<string, unknown>], c) : [];
  const status = vehicleContextStatus(found, Boolean(scoped[0]));
  return { status, vehicle: scoped[0] ?? null };
}

function stampOffers(body: Record<string, unknown>) {
  const sections = Array.isArray(body.sections) ? body.sections : [];
  return {
    ...body,
    sections: sections.map((section) => {
      const row = section as { items?: unknown[] };
      const items = Array.isArray(row.items) ? row.items : [];
      return {
        ...(section as Record<string, unknown>),
        items: items.map((item) => {
          const part = item as { offers?: unknown[] };
          const offers = Array.isArray(part.offers) ? part.offers : [];
          return { ...(item as Record<string, unknown>), bestOffer: offers[0] ?? null };
        }),
      };
    }),
  };
}

async function downtimeFor(orgId: string) {
  if (!orgId) return 0;
  const settings = await kv.get(`organization_settings:${orgId}`);
  return Number((settings as { downtimeCostPerDayJmd?: number } | null)?.downtimeCostPerDayJmd) || 0;
}

export async function loadPartsActivity(supabase: SupabaseClient, orgId: string) {
  const newest = async (table: string, extra?: (q: { eq: (c: string, v: string) => unknown }) => unknown) => {
    let query = supabase.from(table).select("*", { count: "exact" }).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5);
    if (extra) query = extra(query as never) as typeof query;
    const { data, error, count } = await query;
    if (error) throw error;
    return { items: data || [], total: count ?? (data || []).length };
  };
  const [requests, quotes, repeatAlerts, warrantyClaims, cores] = await Promise.all([
    newest("parts_sourcing_requests"),
    newest("part_quote_request"),
    newest("part_repeat_alert"),
    newest("part_warranty_claim"),
    newest("part_core_return"),
  ]);
  return { requests, quotes, repeatAlerts, warrantyClaims, cores };
}

export function registerFleetFindPartsRoutes(app: RouteApp, supabase: SupabaseClient) {
  const view = [requireAuth(), requirePermission("vehicles.view")];

  app.get(`${PREFIX}/find`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      const make = c.req.query("make")?.trim() || "";
      const model = c.req.query("model")?.trim() || "";
      const yearRaw = Number(c.req.query("year") ?? "");
      const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : null;
      const variantId = c.req.query("variantId")?.trim() || "";
      const componentId = c.req.query("componentId")?.trim() || "";
      const position = c.req.query("position") || c.req.query("pos") || "";
      const side = c.req.query("side") || "";

      let vehicle: Record<string, unknown> | null = null;
      let catalogId = "";
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
        if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
        vehicle = access.vehicle;
        catalogId = (await resolveCatalogIdForKvVehicle(supabase, vehicle!)) || "";
        if (!catalogId) {
          return c.json({
            linked: false,
            make: String(vehicle!.make ?? ""),
            model: String(vehicle!.model ?? ""),
            year: vehicle!.year != null ? Number(vehicle!.year) : null,
            vehicle: {
              id: vehicleId,
              label: [vehicle!.year, vehicle!.make, vehicle!.model].filter(Boolean).join(" "),
              plate: String(vehicle!.licensePlate ?? vehicle!.plate ?? ""),
            },
          });
        }
      } else if (!make || !model || year == null) {
        return c.json({ error: "Choose a vehicle, or make, model and year" }, 400);
      }

      const body = await findParts(supabase, {
        make: vehicle ? String(vehicle.make ?? make) : make,
        model: vehicle ? String(vehicle.model ?? model) : model,
        year: vehicle && vehicle.year != null ? Number(vehicle.year) : year,
        variantId: variantId || catalogId || null,
        componentId: componentId || null,
        position: position || null,
        side: side || null,
        orgId: orgId || null,
        downtimePerDay: await downtimeFor(orgId),
      });
      return c.json({
        ...stampOffers(body as unknown as Record<string, unknown>),
        linked: Boolean(catalogId),
        vehicle: vehicle
          ? {
            id: vehicleId,
            label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
            plate: String(vehicle.licensePlate ?? vehicle.plate ?? ""),
          }
          : null,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/browse`, ...view, async (c: Context) => {
    try {
      return c.json(await readPartsBrowse(supabase));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/term`, ...view, async (c: Context) => {
    try {
      return c.json(await readPartTerm(supabase, (c.req.query("q") ?? "").trim()));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/symptoms`, ...view, async (c: Context) => {
    try {
      return c.json(await readSymptoms(supabase));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/quote`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const problem = quoteInputError(body);
      if (problem) return c.json({ error: problem }, 400);
      const vehicleId = body.vehicleId ? String(body.vehicleId) : "";
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status !== 200) return c.json({ error: "Vehicle not found" }, access.status === 403 ? 403 : 404);
      }
      const qty = body.qty != null && body.qty !== "" ? Number(body.qty) : 1;
      const { data, error } = await supabase.from("part_quote_request").insert({
        organization_id: orgId,
        vehicle_id: vehicleId || null,
        part_id: body.partId ? String(body.partId) : null,
        part_number: body.partNumber ? String(body.partNumber) : null,
        qty,
        note: body.note ? String(body.note).slice(0, 140) : null,
        urgency: body.urgency ? String(body.urgency) : "normal",
        maintenance_component_id: body.componentId && UUID_RE.test(String(body.componentId)) ? String(body.componentId) : null,
        supplier_ids: Array.isArray(body.supplierIds) ? body.supplierIds.map(String).slice(0, 8) : [],
        status: "open",
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/request`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const needText = String(body.needText ?? "").trim();
      if (!needText) return c.json({ error: "needText is required" }, 400);
      const urgency = body.urgency ? String(body.urgency) : null;
      if (urgency && !URGENCY.has(urgency)) return c.json({ error: "Urgency must be low, normal, or urgent" }, 400);
      const qty = body.qty != null && body.qty !== "" ? Number(body.qty) : null;
      if (qty != null && (!Number.isFinite(qty) || qty <= 0)) return c.json({ error: "Quantity must be at least 1" }, 400);
      const vehicleId = String(body.vehicleId ?? "").trim();
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status !== 200) return c.json({ error: "Vehicle not found" }, access.status === 403 ? 403 : 404);
      }
      const user = c.get("rbacUser") as { id?: string } | undefined;
      const { data, error } = await supabase.from("parts_sourcing_requests").insert({
        organization_id: orgId,
        vehicle_id: vehicleId || null,
        need_text: needText.slice(0, 2000),
        status: "open",
        created_by: user?.id ?? null,
        maintenance_component_id: body.maintenanceComponentId && UUID_RE.test(String(body.maintenanceComponentId))
          ? String(body.maintenanceComponentId)
          : null,
        platform_id: body.platformId && UUID_RE.test(String(body.platformId)) ? String(body.platformId) : null,
        engine_family_id: body.engineFamilyId && UUID_RE.test(String(body.engineFamilyId)) ? String(body.engineFamilyId) : null,
        urgency,
        qty,
        photo_url: body.photoUrl ? String(body.photoUrl).slice(0, 2000) : null,
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/activity`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      return c.json(await loadPartsActivity(supabase, orgId));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/request-photo`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const form = await c.req.formData();
      const folder = String(form.get("folder") ?? "");
      if (!photoFolderAllowed(orgId, folder)) return c.json({ error: "Wrong organization" }, 403);
      const file = form.get("file");
      if (!(file instanceof File)) return c.json({ error: "Choose a photo" }, 400);
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "photo";
      const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      return c.json({ photo_url: path });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/vehicle-context`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      const componentId = c.req.query("componentId")?.trim() || "";
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      const access = await ownVehicle(c, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      const vehicle = access.vehicle!;
      const metrics = Number((vehicle.metrics as { odometer?: number } | undefined)?.odometer ?? 0);
      const odometer = await canonicalOdometerForVehicle(supabase, vehicleId, metrics, c);
      const { data: schedules, error } = await supabase
        .from("vehicle_component_schedule")
        .select("position, next_due_miles, next_due_miles_max, next_due_date, schedule_status, category:maintenance_service_categories(id, name)")
        .eq("organization_id", orgId)
        .eq("vehicle_id", vehicleId);
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const due = (schedules || []).flatMap((row) => {
        const schedule = row as {
          position?: string | null;
          next_due_miles?: number | null;
          next_due_miles_max?: number | null;
          next_due_date?: string | null;
          schedule_status?: string | null;
          category?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
        };
        const category = Array.isArray(schedule.category) ? schedule.category[0] : schedule.category;
        const analysis = analyzeMaintenanceScheduleRow(
          odometer,
          today,
          schedule.next_due_miles != null ? Number(schedule.next_due_miles) : null,
          schedule.next_due_miles_max != null ? Number(schedule.next_due_miles_max) : null,
          schedule.next_due_date ? String(schedule.next_due_date).slice(0, 10) : null,
          schedule.schedule_status,
        );
        if (analysis.status !== "overdue" && analysis.status !== "pending") return [];
        return [{
          componentId: category?.id ?? null,
          name: category?.name ?? "Service",
          position: schedule.position ?? null,
          kind: analysis.status === "overdue" ? "overdue" : "due_soon",
        }];
      });
      let lastService: { date: string | null; km: number | null } | null = null;
      if (componentId) {
        const { data: last, error: lastError } = await supabase
          .from("maintenance_service_ledger")
          .select("performed_at_date, performed_at_miles")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .eq("category_id", componentId)
          .is("voided_at", null)
          .order("performed_at_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastError) throw lastError;
        if (last) {
          lastService = {
            date: (last as { performed_at_date?: string }).performed_at_date ?? null,
            km: (last as { performed_at_miles?: number }).performed_at_miles != null
              ? Number((last as { performed_at_miles?: number }).performed_at_miles)
              : null,
          };
        }
      }
      return c.json({ odometer, due, lastService });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/vehicle-options`, ...view, async (c: Context) => {
    try {
      const make = (c.req.query("make") ?? "").trim();
      const model = (c.req.query("model") ?? "").trim();
      let query = supabase.from("vehicle_catalog").select("make, model, production_start_year, production_end_year");
      if (make) query = query.ilike("make", make);
      if (model) query = query.ilike("model", model);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      const rows = (data || []) as Array<{ make?: string; model?: string; production_start_year?: number; production_end_year?: number }>;
      const makes = [...new Set(rows.map((row) => String(row.make ?? "")).filter(Boolean))].sort();
      const models = [...new Set(rows.map((row) => String(row.model ?? "")).filter(Boolean))].sort();
      const years = new Set<number>();
      for (const row of rows) {
        const from = Number(row.production_start_year ?? 0);
        const to = Number(row.production_end_year ?? from);
        if (!from) continue;
        for (let year = from; year <= (to || from); year += 1) years.add(year);
      }
      return c.json({ makes, models, years: [...years].sort((a, b) => b - a) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/catalog-request`, ...view, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const make = String(body.make ?? "").trim();
      const model = String(body.model ?? "").trim();
      const year = Number(body.year);
      if (!make || !model || !Number.isFinite(year)) return c.json({ error: "Make, model and year are required" }, 400);
      const orgId = String(getOrgId(c) || "");
      const vehicleId = String(body.vehicleId ?? "").trim();
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
        if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
        await upsertPendingFromKvVehicle(supabase, {
          organizationId: orgId,
          fleetVehicleId: vehicleId,
          vehicle: { ...(access.vehicle as Record<string, unknown>), make, model, year },
          source: "find_parts",
        });
        return c.json({ ok: true });
      }
      const fleetVehicleId = `unlisted:${orgId}:${make}:${model}:${year}`.slice(0, 180);
      const { error } = await supabase.from("vehicle_catalog_pending_requests").insert({
        organization_id: orgId,
        fleet_vehicle_id: fleetVehicleId,
        proposed_make: make,
        proposed_model: model,
        proposed_year: year,
        proposed_production_start_year: year,
        proposed_production_end_year: year,
        source: "find_parts",
        status: "pending",
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });
}
