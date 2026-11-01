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
import { readPartTerm, readPartsBrowseForVariant, readSymptoms } from "./parts_catalog_read.ts";
import { canonicalOdometerForVehicle } from "./canonical_vehicle_odometer.ts";
import { analyzeMaintenanceScheduleRow } from "../../../packages/finance-core/src/maintenanceOverdueDetails.ts";
import { upsertPendingFromKvVehicle } from "./vehicle_catalog_pending_queries.ts";
import { loadVehiclePartsContextExtras, vehiclePlateFromKv } from "./vehicle_parts_context.ts";
import { buildPartsSourcingInsert, normalizeMatchType } from "./parts_sourcing_request_build.ts";
import { readComponentFitHints } from "./parts_component_fit_hints.ts";
import { resolvePartsFitPairs } from "../../../packages/types/src/partsFitParam.ts";

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

export async function loadPartsActivity(supabase: SupabaseClient, orgId: string) {
  const newest = async (table: string) => {
    const { data, error, count } = await supabase.from(table).select("*", { count: "exact" }).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5);
    if (error) throw error;
    return { items: data || [], total: count ?? (data || []).length };
  };
  const [requests, repeatAlerts] = await Promise.all([
    newest("parts_sourcing_requests"),
    newest("part_repeat_alert"),
  ]);
  return { requests, repeatAlerts };
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
      const fit = c.req.query("fit") || "";
      const fitPairs = resolvePartsFitPairs({ fit, position, side });

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
        position: fitPairs.length === 1 ? fitPairs[0].axle : (fitPairs.length ? null : (position || null)),
        side: fitPairs.length === 1 ? fitPairs[0].side : (fitPairs.length ? null : (side || null)),
        fitPairs: fitPairs.length ? fitPairs : null,
        orgId: null,
        downtimePerDay: 0,
      });
      return c.json({
        ...body,
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
      const variantId = c.req.query("variantId")?.trim() || "";
      if (variantId && !UUID_RE.test(variantId)) return c.json({ error: "Invalid variant" }, 400);
      return c.json(await readPartsBrowseForVariant(supabase, variantId || undefined));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(`${PREFIX}/component-fit-hints`, ...view, async (c: Context) => {
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      const componentId = c.req.query("componentId")?.trim() || "";
      if (!variantId || !UUID_RE.test(variantId)) return c.json({ error: "variantId required" }, 400);
      if (!componentId || !UUID_RE.test(componentId)) return c.json({ error: "componentId required" }, 400);
      return c.json(await readComponentFitHints(supabase, variantId, componentId));
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
      const variantId = c.req.query("variantId")?.trim() || "";
      if (variantId && !UUID_RE.test(variantId)) return c.json({ error: "Invalid variant" }, 400);
      return c.json(await readSymptoms(supabase, variantId ? { variantId } : undefined));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post(`${PREFIX}/request`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const needText = String(body.needText ?? body.note ?? "").trim();
      if (!needText && body.kind !== "add_part_info") return c.json({ error: "needText is required" }, 400);
      const kind = body.kind ? String(body.kind).slice(0, 40) : null;
      const isAddPart = kind === "add_part_info";
      const urgency = isAddPart ? null : (body.urgency ? String(body.urgency) : null);
      if (urgency && !URGENCY.has(urgency)) return c.json({ error: "Urgency must be low, normal, urgent, or within_24h" }, 400);
      const qty = isAddPart ? null : (body.qty != null && body.qty !== "" ? Number(body.qty) : null);
      if (qty != null && (!Number.isFinite(qty) || qty <= 0)) return c.json({ error: "Quantity must be at least 1" }, 400);
      const vehicleId = String(body.vehicleId ?? "").trim();
      if (vehicleId) {
        const access = await ownVehicle(c, vehicleId);
        if (access.status !== 200) return c.json({ error: "Vehicle not found" }, access.status === 403 ? 403 : 404);
      }
      const user = c.get("rbacUser") as { id?: string } | undefined;
      const side = body.side ? String(body.side).slice(0, 20) : null;
      const position = body.position ? String(body.position).slice(0, 20) : null;
      const catalogVariantId = body.vehicleCatalogId && UUID_RE.test(String(body.vehicleCatalogId))
        ? String(body.vehicleCatalogId)
        : (body.platformId && UUID_RE.test(String(body.platformId)) ? String(body.platformId) : null);
      const matchType = normalizeMatchType(body.matchType ?? body.match_type);
      const composedNeed = needText
        || [String(body.partName ?? "").trim(), side, position].filter(Boolean).join(" · ")
        || "Part info request";
      const sentAt = isAddPart ? new Date().toISOString() : null;
      const insertRow = await buildPartsSourcingInsert(supabase, {
        orgId,
        vehicleId: vehicleId || null,
        needText: composedNeed,
        componentId: body.maintenanceComponentId && UUID_RE.test(String(body.maintenanceComponentId))
          ? String(body.maintenanceComponentId)
          : (body.componentId && UUID_RE.test(String(body.componentId)) ? String(body.componentId) : null),
        engineFamilyId: body.engineFamilyId && UUID_RE.test(String(body.engineFamilyId)) ? String(body.engineFamilyId) : null,
        vehicleCatalogId: catalogVariantId,
        matchType: isAddPart ? matchType : null,
        fit: body,
        kind,
        urgency,
        qty,
        userId: user?.id ?? null,
        photoUrl: body.photoUrl ? String(body.photoUrl).slice(0, 2000) : null,
        sentAt,
        replyDueAt: urgency ? replyDueAt(urgency) : null,
      });
      const { data, error } = await supabase.from("parts_sourcing_requests").insert(insertRow).select("*").single();
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
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      const access = await ownVehicle(c, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      const vehicle = access.vehicle!;
      const extras = await loadVehiclePartsContextExtras(supabase, orgId, vehicleId, vehicle as Record<string, unknown>);
      const catalogId = (await resolveCatalogIdForKvVehicle(supabase, vehicle)) || "";
      return c.json({
        label: extras.label,
        plate: extras.plate,
        version: extras.trim || extras.variant,
        variantId: catalogId || null,
        specs: {
          trim_series: extras.trim_series,
          engine_code: extras.engine_code,
          engine_displacement_l: extras.engine_displacement_l,
          drivetrain: extras.drivetrain,
          chassis_code: extras.chassis_code,
          engineFilterLine: extras.engineFilterLine,
          alternateTrimsLine: extras.alternateTrimsLine,
        },
        orgShortCode: extras.orgShortCode,
        hub_label: extras.hub_label,
      });
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
      const vehicleIds = cars.map((car) => String(car.id ?? car.vehicleId ?? "")).filter(Boolean);
      const dueByVehicle = new Map<string, string>();
      if (vehicleIds.length) {
        const { data: schedules, error: schedErr } = await supabase
          .from("vehicle_component_schedule")
          .select("vehicle_id, position, next_due_miles, next_due_miles_max, next_due_date, schedule_status, category:maintenance_service_categories(name)")
          .eq("organization_id", orgId)
          .in("vehicle_id", vehicleIds);
        if (schedErr) throw schedErr;
        const today = new Date().toISOString().slice(0, 10);
        for (const car of cars) {
          const vehicleId = String(car.id ?? car.vehicleId ?? "");
          if (!vehicleId) continue;
          const odometer = Number((car.metrics as { odometer?: number } | undefined)?.odometer ?? 0);
          for (const row of schedules || []) {
            if (String((row as { vehicle_id?: string }).vehicle_id ?? "") !== vehicleId) continue;
            const schedule = row as {
              position?: string | null;
              next_due_miles?: number | null;
              next_due_miles_max?: number | null;
              next_due_date?: string | null;
              schedule_status?: string | null;
              category?: { name?: string } | { name?: string }[] | null;
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
            if (analysis.status !== "overdue" && analysis.status !== "pending") continue;
            const name = String(category?.name ?? "Service").trim();
            if (name && !dueByVehicle.has(vehicleId)) dueByVehicle.set(vehicleId, name);
          }
        }
      }
      const items = cars.map((car) => {
        const vehicleId = String(car.id ?? car.vehicleId ?? "");
        const fromSchedule = dueByVehicle.get(vehicleId);
        const fromKv = String(car.serviceDue ?? "").trim();
        const serviceDue = fromSchedule || fromKv || null;
        const card = myVehicleCard({
          make: String(car.make ?? ""),
          model: String(car.model ?? ""),
          year: car.year as string | number | null,
          versionLine: String(car.catalogVersionLabel ?? car.trim ?? "") || null,
          verified: Boolean(car.catalogId || car.vehicleCatalogId),
          shelfCount: Number(car.shelfCount ?? 0) || 0,
          serviceDue,
        });
        return {
          ...card,
          vehicle_id: vehicleId,
          plate: vehiclePlateFromKv(car),
          label: card.name,
          subtitle: card.versionLine !== "None yet" ? card.versionLine : undefined,
          service_due: card.serviceDue !== "None yet" ? card.serviceDue : undefined,
          serviceDue: card.serviceDue,
        };
      });
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
}
