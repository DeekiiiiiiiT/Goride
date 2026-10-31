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
import { loadVehiclePartsContextExtras } from "./vehicle_parts_context.ts";

const PREFIX = "/make-server-37f42386/parts";
const PHOTO_BUCKET = "parts-request-photos";
const URGENCY = new Set(["low", "normal", "urgent", "within_24h"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hours until a supplier reply is due. 24h urgency is stored as within_24h. */
export function replyDueAt(urgency: string, from = Date.now()): string {
  const hours = urgency === "within_24h" ? 24 : urgency === "urgent" ? 8 : urgency === "low" ? 72 : 48;
  return new Date(from + hours * 3_600_000).toISOString();
}

export function scopedToOrg<T extends { organization_id?: string | null }>(rows: T[], orgId: string): T[] {
  return rows.filter((row) => row.organization_id === orgId);
}

export function myVehicleCard(input: {
  make?: string;
  model?: string;
  year?: string | number | null;
  versionLine?: string | null;
  verified?: boolean;
  shelfCount?: number;
  serviceDue?: string | null;
}) {
  return {
    name: [input.make, input.model, input.year].filter(Boolean).join(" "),
    versionLine: input.versionLine || "None yet",
    verified: Boolean(input.verified),
    shelfCount: input.shelfCount ?? 0,
    serviceDue: input.serviceDue || "None yet",
  };
}

/** Km since the last service of this part, divided by the interval. 0 when unknown. */
export function wearPercent(kmSince: number | null, intervalKm: number | null): number | null {
  if (kmSince == null || !intervalKm || intervalKm <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - kmSince / intervalKm) * 100)));
}

export function quoteInputError(body: Record<string, unknown>): string | null {
  const qty = body.qty != null && body.qty !== "" ? Number(body.qty) : 1;
  if (!Number.isFinite(qty) || qty <= 0) return "Quantity must be at least 1";
  const urgency = body.urgency ? String(body.urgency) : "";
  if (urgency && !URGENCY.has(urgency)) return "Urgency must be low, normal, urgent, or within_24h";
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
        reply_due_at: replyDueAt(body.urgency ? String(body.urgency) : "normal"),
        target_price_jmd: body.targetPriceJmd != null && body.targetPriceJmd !== "" ? Number(body.targetPriceJmd) : null,
        linked_service_id: body.linkedServiceId ? String(body.linkedServiceId).slice(0, 80) : null,
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
      if (urgency && !URGENCY.has(urgency)) return c.json({ error: "Urgency must be low, normal, urgent, or within_24h" }, 400);
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
        reply_due_at: urgency ? replyDueAt(urgency) : null,
        kind: body.kind ? String(body.kind).slice(0, 40) : null,
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
      const extras = await loadVehiclePartsContextExtras(supabase, orgId, vehicleId, vehicle as Record<string, unknown>);
      return c.json({ odometer, due, lastService, ...extras });
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

  app.get(`${PREFIX}/my-vehicles`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const raw = await kv.getByPrefix("vehicle:");
      const cars = filterByOrg(Array.isArray(raw) ? raw as Record<string, unknown>[] : [], c).slice(0, 40);
      const items = cars.map((car) => myVehicleCard({
        make: String(car.make ?? ""),
        model: String(car.model ?? ""),
        year: car.year as string | number | null,
        versionLine: String(car.catalogVersionLabel ?? car.trim ?? "") || null,
        verified: Boolean(car.catalogId || car.vehicleCatalogId),
        shelfCount: Number(car.shelfCount ?? 0) || 0,
        serviceDue: String(car.serviceDue ?? "") || null,
      }));
      return c.json({ items, organizationId: orgId });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/saved-searches`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const { data, error } = await supabase.from("fleet_saved_part_searches").select("id, name, url, created_at, organization_id").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return c.json({ items: scopedToOrg(data || [], orgId) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/saved-searches`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const user = c.get("rbacUser") as { userId?: string } | undefined;
      const body = await c.req.json() as { name?: string; url?: string };
      const name = String(body.name ?? "").trim().slice(0, 80);
      const url = String(body.url ?? "").trim().slice(0, 500);
      if (!name || !url) return c.json({ error: "Name and url are required" }, 400);
      const { data, error } = await supabase.from("fleet_saved_part_searches").insert({
        organization_id: orgId,
        user_id: user?.userId ?? null,
        name,
        url,
      }).select("id, name, url").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/parts-list`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const user = c.get("rbacUser") as { userId?: string } | undefined;
      const { data: list, error } = await supabase.from("fleet_parts_list").select("id, status").eq("organization_id", orgId).eq("user_id", user?.userId ?? "").eq("status", "open").maybeSingle();
      if (error) throw error;
      if (!list) return c.json({ list: null, lines: [] });
      const { data: lines, error: lineError } = await supabase.from("fleet_parts_list_line").select("id, label, qty, part_id, supplier_id, organization_id").eq("list_id", (list as { id: string }).id).eq("organization_id", orgId);
      if (lineError) throw lineError;
      return c.json({ list, lines: scopedToOrg(lines || [], orgId) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/parts-list`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const user = c.get("rbacUser") as { userId?: string } | undefined;
      const body = await c.req.json() as { label?: string; qty?: number; partId?: string; supplierId?: string; componentId?: string };
      const label = String(body.label ?? "").trim().slice(0, 160);
      if (!label) return c.json({ error: "Label is required" }, 400);
      let listId = "";
      const { data: existing } = await supabase.from("fleet_parts_list").select("id").eq("organization_id", orgId).eq("user_id", user?.userId ?? "").eq("status", "open").maybeSingle();
      if (existing && (existing as { id?: string }).id) listId = String((existing as { id: string }).id);
      else {
        const { data: created, error } = await supabase.from("fleet_parts_list").insert({
          organization_id: orgId,
          user_id: user?.userId ?? null,
          status: "open",
        }).select("id").single();
        if (error) throw error;
        listId = String((created as { id: string }).id);
      }
      const { error: lineError } = await supabase.from("fleet_parts_list_line").insert({
        list_id: listId,
        organization_id: orgId,
        label,
        qty: Number(body.qty) > 0 ? Number(body.qty) : 1,
        part_id: body.partId && UUID_RE.test(body.partId) ? body.partId : null,
        supplier_id: body.supplierId && UUID_RE.test(body.supplierId) ? body.supplierId : null,
        component_id: body.componentId && UUID_RE.test(body.componentId) ? body.componentId : null,
      });
      if (lineError) throw lineError;
      return c.json({ ok: true, listId });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/wrong-fit`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const body = await c.req.json() as { table?: string; id?: string };
      const table = body.table === "part_quote_request" ? "part_quote_request" : "parts_sourcing_requests";
      const id = String(body.id ?? "");
      if (!UUID_RE.test(id)) return c.json({ error: "id required" }, 400);
      const { data: row, error: readError } = await supabase.from(table).select("id, organization_id").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!row || (row as { organization_id?: string }).organization_id !== orgId) return c.json({ error: "Not found" }, 404);
      const { error } = await supabase.from(table).update({ wrong_fit_reported_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/wrong-fit-count`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const countTable = async (table: string) => {
        const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("wrong_fit_reported_at", since);
        if (error) throw error;
        return count ?? 0;
      };
      const [requests, quotes] = await Promise.all([countTable("parts_sourcing_requests"), countTable("part_quote_request")]);
      return c.json({ count: requests + quotes, days: 90 });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/notify-admin`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const body = await c.req.json() as { kind?: string; title?: string; body?: string };
      const title = String(body.title ?? "Parts desk").trim().slice(0, 120);
      const message = String(body.body ?? "").trim().slice(0, 500);
      if (!message) return c.json({ error: "Message is required" }, 400);
      const { error } = await supabase.from("fleet_parts_notices").insert({
        organization_id: orgId,
        kind: String(body.kind ?? "admin").slice(0, 40),
        title,
        body: message,
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/supplier-sync`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const { data, error } = await supabase.from("parts_supplier_sync_run").select("id, status, message, started_at, finished_at, organization_id").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      const row = data && (data as { organization_id?: string }).organization_id === orgId ? data : null;
      return c.json({ last: row, online: false });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/supplier-sync`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const { error } = await supabase.from("parts_supplier_sync_run").insert({
        organization_id: orgId,
        status: "ok",
        message: "Cache-only adapter. No live vendor feed is connected yet.",
        finished_at: new Date().toISOString(),
      });
      if (error) throw error;
      return c.json({ ok: true, message: "Cache-only adapter. No live vendor feed is connected yet." });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/fitment-report`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status !== 200) return c.json({ error: "Vehicle not found" }, access.status === 403 ? 403 : 404);
      }
      const header = "section,part,qty_on_shelf,offer\n";
      return new Response(header, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=fitment-report.csv",
          "x-organization-id": orgId,
        },
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/runner-online`, ...view, async (c: Context) => {
    return c.json({ online: false, windowMinutes: 15 });
  });
}
