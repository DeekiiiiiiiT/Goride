/**
 * Fleet Find parts routes. The search itself is parts_finder.ts.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import {
  findPartsCatalogVariant,
  partFitsCatalogIds,
  readExplicitCatalogLink,
  rejectUnlessVehicleId,
  requireVariantInVerifiedSet,
  verifiedCarForVehicle,
  verifiedCatalogIdFromLink,
  verifiedCatalogIdsForOrg,
  vehicleContextStatus,
} from "./fleet_parts_access.ts";
import { findParts } from "./parts_finder.ts";
import { readPartTerm, readPartsBrowseForVariant, readSymptoms } from "./parts_catalog_read.ts";
import { readCatalogAddAvgMinutes, readComponentListingHints } from "./parts_find_parts_overlay_meta.ts";
import { canonicalOdometerForVehicle } from "./canonical_vehicle_odometer.ts";
import { analyzeMaintenanceScheduleRow } from "../../../packages/finance-core/src/maintenanceOverdueDetails.ts";
import { upsertPendingFromKvVehicle } from "./vehicle_catalog_pending_queries.ts";
import { loadVehiclePartsContextExtras, vehiclePlateFromKv } from "./vehicle_parts_context.ts";
import { buildPartsSourcingInsert, normalizeMatchType } from "./parts_sourcing_request_build.ts";
import {
  countOrgRequestsToday,
  DAILY_LIMIT_MESSAGE,
  DAILY_REQUEST_LIMIT,
  ensureCatalogResearchJob,
  findDedupedOpenRequest,
  researchGroupKeyFromRow,
} from "./catalog_research_intake.ts";
import { readComponentFitHints } from "./parts_component_fit_hints.ts";
import { resolvePartsFitPairs } from "../../../packages/types/src/partsFitParam.ts";
import { readFleetPartLookup } from "./fleet_parts_lookup.ts";
import { readBrakesOverview } from "./read_brakes_overview.ts";

const PREFIX = "/make-server-37f42386/parts";

/** Database errors are plain objects, not Error: show their message instead of "[object Object]". */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

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

/** T9: verified only when explicit vehicle_catalog_id exists in vehicle_catalog (not catalogId alias alone). */
export function myVehicleVerifiedFromKv(
  car: Record<string, unknown>,
  existingCatalogIds: ReadonlySet<string>,
): boolean {
  const link = readExplicitCatalogLink(car);
  return Boolean(verifiedCatalogIdFromLink(link, existingCatalogIds));
}

type VehicleContextExtrasForSpecs = {
  trim_series?: string | null;
  engine_code?: string | null;
  engine_displacement_l?: number | null;
  drivetrain?: string | null;
  chassis_code?: string | null;
  engineFilterLine?: string | null;
  alternateTrimsLine?: string | null;
  brake_front_type?: string | null;
  brake_rear_type?: string | null;
  brake_front_rotor_mm?: number | null;
  brake_rear_drum_mm?: number | null;
  hub_bolt_pattern?: string | null;
  abs_channels?: string | null;
  handbrake_type?: string | null;
};

const NULL_VEHICLE_SPECS = {
  trim_series: null,
  engine_code: null,
  engine_displacement_l: null,
  drivetrain: null,
  chassis_code: null,
  engineFilterLine: null,
  alternateTrimsLine: null,
  brake_front_type: null,
  brake_rear_type: null,
  brake_front_rotor_mm: null,
  brake_rear_drum_mm: null,
  hub_bolt_pattern: null,
  abs_channels: null,
  handbrake_type: null,
} as const;

/** T10: unverified cars must not expose guessed MMY specs from loadVehiclePartsContextExtras. */
export function vehicleContextSpecsForResponse(verified: boolean, extras: VehicleContextExtrasForSpecs) {
  if (!verified) return { ...NULL_VEHICLE_SPECS };
  return {
    trim_series: extras.trim_series ?? null,
    engine_code: extras.engine_code ?? null,
    engine_displacement_l: extras.engine_displacement_l ?? null,
    drivetrain: extras.drivetrain ?? null,
    chassis_code: extras.chassis_code ?? null,
    engineFilterLine: extras.engineFilterLine ?? null,
    alternateTrimsLine: extras.alternateTrimsLine ?? null,
    brake_front_type: extras.brake_front_type ?? null,
    brake_rear_type: extras.brake_rear_type ?? null,
    brake_front_rotor_mm: extras.brake_front_rotor_mm ?? null,
    brake_rear_drum_mm: extras.brake_rear_drum_mm ?? null,
    hub_bolt_pattern: extras.hub_bolt_pattern ?? null,
    abs_channels: extras.abs_channels ?? null,
    handbrake_type: extras.handbrake_type ?? null,
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

export { vehicleContextStatus } from "./fleet_parts_access.ts";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
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
  const [requestsRaw, repeatAlerts] = await Promise.all([
    newest("parts_sourcing_requests"),
    newest("part_repeat_alert"),
  ]);

  const jobIds = [...new Set(
    (requestsRaw.items as Array<{ catalog_research_job_id?: string | null }>)
      .map((r) => r.catalog_research_job_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const retryByJob = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs, error: jobsErr } = await supabase
      .from("catalog_research_job")
      .select("id, next_research_at")
      .in("id", jobIds);
    if (jobsErr) throw jobsErr;
    for (const j of jobs || []) {
      const row = j as { id: string; next_research_at?: string | null };
      if (row.next_research_at) retryByJob.set(row.id, row.next_research_at);
    }
  }
  const requests = {
    ...requestsRaw,
    items: (requestsRaw.items as Array<Record<string, unknown>>).map((row) => {
      const jobId = row.catalog_research_job_id ? String(row.catalog_research_job_id) : "";
      const retryAt = jobId ? retryByJob.get(jobId) : undefined;
      return retryAt ? { ...row, retry_at: retryAt } : row;
    }),
  };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("parts_sourcing_requests")
    .select("status, sent_at, created_at, added_at")
    .eq("organization_id", orgId)
    .eq("kind", "add_part_info")
    .gte("created_at", since)
    .limit(500);
  const rows = recent || [];
  const resolved = rows.filter((r) => String((r as { status?: string }).status) === "resolved");
  const medianMinutes = await readCatalogAddAvgMinutes(supabase, orgId);
  const batchMatchRate = rows.length
    ? Math.round((resolved.length / rows.length) * 100)
    : null;
  const { count: queueAhead } = await supabase
    .from("parts_sourcing_requests")
    .select("id", { count: "exact", head: true })
    .eq("kind", "add_part_info")
    .in("status", ["open", "in_progress"])
    .lt("created_at", new Date().toISOString());
  return {
    requests,
    repeatAlerts,
    meta: {
      medianAddMinutes: medianMinutes,
      batchMatchRate,
      resolvedCount30d: resolved.length,
      queueDepth: queueAhead ?? 0,
    },
  };
}

export function registerFleetFindPartsRoutes(app: RouteApp, supabase: SupabaseClient) {
  const view = [requireAuth(), requirePermission("vehicles.view")];

  app.get(`${PREFIX}/find`, ...view, async (c: Context) => {
    try {
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      const vehicleGate = rejectUnlessVehicleId(vehicleId);
      if (vehicleGate) return c.json({ error: vehicleGate.error }, vehicleGate.status);
      const componentId = c.req.query("componentId")?.trim() || "";
      const position = c.req.query("position") || c.req.query("pos") || "";
      const side = c.req.query("side") || "";
      const fit = c.req.query("fit") || "";
      const fitPairs = resolvePartsFitPairs({ fit, position, side });

      const access = await verifiedCarForVehicle(c, supabase, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      const vehicle = access.vehicle!;
      const catalogId = access.catalogId;
      if (!catalogId) {
        return c.json({
          linked: false,
          verified: false,
          make: String(vehicle.make ?? ""),
          model: String(vehicle.model ?? ""),
          year: vehicle.year != null ? Number(vehicle.year) : null,
          vehicle: {
            id: vehicleId,
            label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
            plate: String(vehicle.licensePlate ?? vehicle.plate ?? ""),
          },
        });
      }

      const body = await findParts(supabase, {
        make: String(vehicle.make ?? ""),
        model: String(vehicle.model ?? ""),
        year: vehicle.year != null ? Number(vehicle.year) : null,
        variantId: findPartsCatalogVariant(catalogId, c.req.query("variantId")?.trim() || undefined),
        componentId: componentId || null,
        position: fitPairs.length === 1 ? fitPairs[0].axle : (fitPairs.length ? null : (position || null)),
        side: fitPairs.length === 1 ? fitPairs[0].side : (fitPairs.length ? null : (side || null)),
        fitPairs: fitPairs.length ? fitPairs : null,
        orgId: null,
        downtimePerDay: 0,
      });
      return c.json({
        ...body,
        linked: true,
        verified: true,
        vehicle: {
          id: vehicleId,
          label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
          plate: String(vehicle.licensePlate ?? vehicle.plate ?? ""),
        },
      });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/lookup`, ...view, async (c: Context) => {
    try {
      const partId = (c.req.query("partId") ?? "").trim();
      const verifiedIds = await verifiedCatalogIdsForOrg(c, supabase);
      const fits = await partFitsCatalogIds(supabase, partId, verifiedIds);
      if (!fits) return c.json({ error: "Part not found" }, 404);
      const queryVariant = (c.req.query("variantId") ?? c.req.query("vehicleCatalogId") ?? "").trim();
      const vehicleCatalogId = queryVariant && verifiedIds.includes(queryVariant) ? queryVariant : null;
      const out = await readFleetPartLookup(supabase, { partId, vehicleCatalogId });
      if ("error" in out && out.status !== 200) {
        return c.json({ error: out.error }, out.status);
      }
      return c.json(out.body);
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/brakes-overview`, ...view, async (c: Context) => {
    try {
      const variantId = (c.req.query("variantId") ?? "").trim();
      const verifiedIds = await verifiedCatalogIdsForOrg(c, supabase);
      const gate = requireVariantInVerifiedSet(variantId, verifiedIds);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
      const yearRaw = Number(c.req.query("year") ?? c.req.query("vehicleYear") ?? "");
      const vehicleYear = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : null;
      const out = await readBrakesOverview(supabase, variantId, vehicleYear);
      if ("error" in out && out.status !== 200) {
        return c.json({ error: out.error }, out.status);
      }
      return c.json(out.body);
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/catalog-makers`, ...view, async (c: Context) => {
    try {
      const LOGO_BUCKET = "catalog-maker-logos";
      const { data, error } = await supabase.from("catalog_maker").select("make, logo_storage_path").order("make");
      if (error) return c.json({ error: errorText(error) }, 500);
      const items = (data ?? []).map((row) => {
        const make = String((row as { make?: string }).make ?? "");
        const storagePath = (row as { logo_storage_path?: string | null }).logo_storage_path?.trim() || null;
        let logoUrl: string | null = null;
        if (storagePath) {
          const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
          logoUrl = pub?.publicUrl ?? null;
        }
        return { make, logoUrl };
      });
      return c.json({ items });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/browse`, ...view, async (c: Context) => {
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      const verifiedIds = await verifiedCatalogIdsForOrg(c, supabase);
      const gate = requireVariantInVerifiedSet(variantId, verifiedIds);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
      return c.json(await readPartsBrowseForVariant(supabase, variantId));
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/component-fit-hints`, ...view, async (c: Context) => {
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      const componentId = c.req.query("componentId")?.trim() || "";
      const verifiedIds = await verifiedCatalogIdsForOrg(c, supabase);
      const gate = requireVariantInVerifiedSet(variantId, verifiedIds);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
      if (!componentId || !UUID_RE.test(componentId)) return c.json({ error: "componentId required" }, 400);
      return c.json(await readComponentFitHints(supabase, variantId, componentId));
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/term`, ...view, async (c: Context) => {
    try {
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      const termVehicleGate = rejectUnlessVehicleId(vehicleId);
      if (termVehicleGate) return c.json({ error: termVehicleGate.error }, termVehicleGate.status);
      const access = await verifiedCarForVehicle(c, supabase, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      if (!access.catalogId) {
        return c.json({ components: [], synonyms: [], parts: [], hits: [], verified: false });
      }
      const term = await readPartTerm(supabase, (c.req.query("q") ?? "").trim(), access.catalogId);
      return c.json({ ...term, verified: true });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/symptoms`, ...view, async (c: Context) => {
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      const verifiedIds = await verifiedCatalogIdsForOrg(c, supabase);
      const gate = requireVariantInVerifiedSet(variantId, verifiedIds);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
      return c.json(await readSymptoms(supabase, { variantId }));
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
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
      const requestVehicleGate = rejectUnlessVehicleId(vehicleId);
      if (requestVehicleGate) return c.json({ error: requestVehicleGate.error }, requestVehicleGate.status);
      const access = await verifiedCarForVehicle(c, supabase, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      const catalogVariantId = access.catalogId;
      const user = c.get("rbacUser") as { id?: string } | undefined;
      const side = body.side ? String(body.side).slice(0, 20) : null;
      const position = body.position ? String(body.position).slice(0, 20) : null;
      const matchType = normalizeMatchType(body.matchType ?? body.match_type);
      const composedNeed = needText
        || [String(body.partName ?? "").trim(), side, position].filter(Boolean).join(" · ")
        || "Part info request";
      const sentAt = isAddPart ? new Date().toISOString() : null;
      const insertRow = await buildPartsSourcingInsert(supabase, {
        orgId,
        vehicleId,
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
        oldPartNumber: body.oldPartNumber ?? body.old_part_number ?? null,
      });

      if (isAddPart) {
        const groupKey = researchGroupKeyFromRow(insertRow as Record<string, unknown>);
        const dup = await findDedupedOpenRequest(supabase, orgId, groupKey);
        if (dup) return c.json({ item: dup, deduped: true });

        const todayCount = await countOrgRequestsToday(supabase, orgId);
        if (todayCount >= DAILY_REQUEST_LIMIT) {
          return c.json({ error: DAILY_LIMIT_MESSAGE }, 429);
        }

        const jobId = await ensureCatalogResearchJob(supabase, {
          vehicle_catalog_id: insertRow.vehicle_catalog_id as string | null,
          maintenance_component_id: insertRow.maintenance_component_id as string | null,
          fit_descriptor: insertRow.fit_descriptor as string | null,
          install_side: insertRow.install_side as string | null,
          match_type: insertRow.match_type as string | null,
        }, groupKey);

        const rowToInsert = {
          ...insertRow,
          research_group_key: groupKey,
          catalog_research_job_id: jobId,
        };
        const { data, error } = await supabase.from("parts_sourcing_requests").insert(rowToInsert).select("*").single();
        if (error) throw error;
        return c.json({ item: data });
      }

      const { data, error } = await supabase.from("parts_sourcing_requests").insert(insertRow).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/activity`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      return c.json(await loadPartsActivity(supabase, orgId));
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
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
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/vehicle-context`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const vehicleId = c.req.query("vehicleId")?.trim() || "";
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      const access = await verifiedCarForVehicle(c, supabase, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      const vehicle = access.vehicle!;
      const extras = await loadVehiclePartsContextExtras(supabase, orgId, vehicleId, vehicle as Record<string, unknown>);
      const catalogId = access.catalogId;
      const catalogAddAvgMinutes = await readCatalogAddAvgMinutes(supabase, orgId);
      const verified = Boolean(catalogId);
      return c.json({
        label: extras.label,
        plate: extras.plate,
        version: extras.trim || extras.variant,
        variantId: catalogId,
        verified,
        catalogAddAvgMinutes,
        specs: vehicleContextSpecsForResponse(verified, extras),
        orgShortCode: extras.orgShortCode,
        hub_label: extras.hub_label,
      });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
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
      const catalogRequestGate = rejectUnlessVehicleId(vehicleId);
      if (catalogRequestGate) return c.json({ error: catalogRequestGate.error }, catalogRequestGate.status);
      const access = await verifiedCarForVehicle(c, supabase, vehicleId);
      if (access.status === 404) return c.json({ error: "Vehicle not found" }, 404);
      if (access.status === 403) return c.json({ error: "Forbidden" }, 403);
      await upsertPendingFromKvVehicle(supabase, {
        organizationId: orgId,
        fleetVehicleId: vehicleId,
        vehicle: { ...(access.vehicle as Record<string, unknown>), make, model, year },
        source: "find_parts",
      });
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
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
          .select("vehicle_id, position, next_due_km, next_due_km_max, next_due_date, schedule_status, category:maintenance_service_categories(name)")
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
              next_due_km?: number | null;
              next_due_km_max?: number | null;
              next_due_date?: string | null;
              schedule_status?: string | null;
              category?: { name?: string } | { name?: string }[] | null;
            };
            const category = Array.isArray(schedule.category) ? schedule.category[0] : schedule.category;
            const analysis = analyzeMaintenanceScheduleRow(
              odometer,
              today,
              schedule.next_due_km != null ? Number(schedule.next_due_km) : null,
              schedule.next_due_km_max != null ? Number(schedule.next_due_km_max) : null,
              schedule.next_due_date ? String(schedule.next_due_date).slice(0, 10) : null,
              schedule.schedule_status,
            );
            if (analysis.status !== "overdue" && analysis.status !== "pending") continue;
            const name = String(category?.name ?? "Service").trim();
            if (name && !dueByVehicle.has(vehicleId)) dueByVehicle.set(vehicleId, name);
          }
        }
      }
      const verifiedCatalogIds = await verifiedCatalogIdsForOrg(c, supabase);
      const verifiedIdSet = new Set(verifiedCatalogIds);
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
          verified: myVehicleVerifiedFromKv(car, verifiedIdSet),
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
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/saved-searches`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const { data, error } = await supabase.from("fleet_saved_part_searches").select("id, name, url, created_at, organization_id").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return c.json({ items: scopedToOrg(data || [], orgId) });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
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
      return c.json({ error: errorText(error) }, 500);
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
      return c.json({ error: errorText(error) }, 500);
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
      return c.json({ error: errorText(error) }, 500);
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
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.post(`${PREFIX}/sourcing-request-note`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const body = await c.req.json() as { id?: string; note?: string };
      const id = String(body.id ?? "").trim();
      const note = String(body.note ?? "").trim().slice(0, 2000);
      if (!UUID_RE.test(id)) return c.json({ error: "Request id required" }, 400);
      if (!note) return c.json({ error: "Note is required" }, 400);
      const { data: row, error: readError } = await supabase
        .from("parts_sourcing_requests")
        .select("id, organization_id, status")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!row || (row as { organization_id?: string }).organization_id !== orgId) {
        return c.json({ error: "Not found" }, 404);
      }
      const { error } = await supabase
        .from("parts_sourcing_requests")
        .update({ looking_note: note, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.get(`${PREFIX}/request-draft`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const user = c.get("rbacUser") as { id?: string } | undefined;
      if (!orgId || !user?.id) return c.json({ error: "Organization required" }, 400);
      const { data, error } = await supabase
        .from("fleet_parts_request_draft")
        .select("payload, updated_at")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return c.json({ draft: data?.payload ?? null, updatedAt: data?.updated_at ?? null });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });

  app.put(`${PREFIX}/request-draft`, ...view, async (c: Context) => {
    try {
      const orgId = String(getOrgId(c) || "");
      const user = c.get("rbacUser") as { id?: string } | undefined;
      if (!orgId || !user?.id) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as { payload?: Record<string, unknown> };
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      const { data, error } = await supabase
        .from("fleet_parts_request_draft")
        .upsert({
          organization_id: orgId,
          user_id: user.id,
          payload,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,user_id" })
        .select("payload, updated_at")
        .single();
      if (error) throw error;
      return c.json({ draft: data.payload, updatedAt: data.updated_at });
    } catch (error) {
      return c.json({ error: errorText(error) }, 500);
    }
  });
}
