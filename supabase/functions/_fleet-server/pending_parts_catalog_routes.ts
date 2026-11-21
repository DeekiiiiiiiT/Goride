/**
 * Dominion Pending catalog — Parts tab queue (add_part_info requests).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { getPlatformSettingsCached } from "./platform_settings.ts";
import { applyPendingPartsGroupFilter, groupIdForRow } from "./pending_parts_group.ts";
import { getCatalogParts } from "./catalog_api.ts";
import { mapPendingOnFileParts } from "./pending_parts_on_file.ts";
import { notifyFleetsRequestOutcome } from "./catalog_research_notify.ts";
import { findParts, fitLabelForPart, splitPlacesForFind } from "./parts_finder.ts";
import { candidateItems, findPartMatches, universalTwinIds } from "./fleet_parts_match.ts";

const PREFIX = "/make-server-37f42386/admin/pending-catalog/parts-queue";
const FORBIDDEN_RESPONSE_KEYS = new Set([
  "organization_id",
  "organization_name",
  "org_name",
  "company",
  "company_name",
  "plate",
  "license_plate",
  "licensePlate",
  "customer_name",
  "user_name",
  "email",
  "created_by",
  "vehicle_id",
  "fleet_count",
  "fleetCount",
]);

export function stripPii<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function sortOrigins(origins: Iterable<string>): string[] {
  const distinct = [...new Set(origins)];
  return distinct.sort((a, b) => {
    if (a === "service_log") return -1;
    if (b === "service_log") return 1;
    return a.localeCompare(b);
  });
}

export type PendingPartsQueueGroup = {
  groupId: string;
  vehicleCatalogId: string | null;
  platformId: string | null;
  componentId: string | null;
  side: string | null;
  fitDescriptor: string | null;
  matchType: string | null;
  firstAsked: string | null;
  lastAsked: string | null;
  photoCount: number;
  status: string;
  requestIds: string[];
  origins: string[];
  positionScheme: string | null;
  positionCodes: string[] | null;
  requestedName: string | null;
  requestedPartNumber: string | null;
  researchJobId: string | null;
  sortFleetCount: number;
};

const OPEN_REQUEST_STATUSES = ["open", "in_progress"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Code review #8: a fixed v2 key can hold asks from different rounds (resolved last month, asked again today). A key
 * with any open ask shows only its open asks (status, counts, dates and requestIds are today's round); a key with no
 * open ask keeps its closed rows as before.
 */
export function currentRoundRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const openKeys = new Set<string>();
  for (const row of rows) {
    if (OPEN_REQUEST_STATUSES.includes(String(row.status || "open"))) openKeys.add(groupIdForRow(row));
  }
  return rows.filter(
    (row) => !openKeys.has(groupIdForRow(row)) || OPEN_REQUEST_STATUSES.includes(String(row.status || "open")),
  );
}

export function groupPartsRequests(allRows: Array<Record<string, unknown>>): PendingPartsQueueGroup[] {
  const groups = new Map<string, PendingPartsQueueGroup & { _origins: Set<string> }>();
  for (const row of currentRoundRows(allRows)) {
    const vehicleCatalogId = row.vehicle_catalog_id ? String(row.vehicle_catalog_id) : "";
    const platformId = row.platform_id ? String(row.platform_id) : "";
    const componentId = row.maintenance_component_id ? String(row.maintenance_component_id) : "";
    const side = row.install_side ? String(row.install_side) : "";
    const fitDescriptor = row.fit_descriptor ? String(row.fit_descriptor) : "";
    const matchType = row.match_type ? String(row.match_type) : "";
    const groupId = groupIdForRow(row);
    const created = String(row.created_at || "");
    const origin = row.origin ? String(row.origin) : "find_parts";
    const existing = groups.get(groupId);
    if (!existing) {
      const positionCodes = Array.isArray(row.position_codes)
        ? row.position_codes.map(String)
        : null;
      groups.set(groupId, {
        groupId,
        vehicleCatalogId: vehicleCatalogId || null,
        platformId: platformId || null,
        componentId: componentId || null,
        side: side || null,
        fitDescriptor: fitDescriptor || null,
        matchType: matchType || null,
        firstAsked: created || null,
        lastAsked: created || null,
        photoCount: row.photo_url ? 1 : 0,
        status: String(row.status || "open"),
        requestIds: [String(row.id)],
        origins: [],
        _origins: new Set([origin]),
        positionScheme: row.position_scheme ? String(row.position_scheme) : null,
        positionCodes,
        requestedName: null,
        requestedPartNumber: null,
        researchJobId: row.catalog_research_job_id ? String(row.catalog_research_job_id) : null,
        sortFleetCount: 0,
      });
      continue;
    }
    existing.requestIds.push(String(row.id));
    existing._origins.add(origin);
    if (created && (!existing.firstAsked || created < existing.firstAsked)) {
      existing.firstAsked = created;
      existing.positionScheme = row.position_scheme ? String(row.position_scheme) : existing.positionScheme;
      existing.positionCodes = Array.isArray(row.position_codes)
        ? row.position_codes.map(String)
        : existing.positionCodes;
    }
    if (created && (!existing.lastAsked || created > existing.lastAsked)) existing.lastAsked = created;
    if (row.photo_url) existing.photoCount += 1;
    if (!existing.researchJobId && row.catalog_research_job_id) {
      existing.researchJobId = String(row.catalog_research_job_id);
    }
  }
  return [...groups.values()].map((g) => {
    const { _origins, ...rest } = g;
    return { ...rest, origins: sortOrigins(_origins) };
  });
}

export async function enrichPendingPartsGroupsWithJobs(
  supabase: SupabaseClient,
  groups: PendingPartsQueueGroup[],
): Promise<PendingPartsQueueGroup[]> {
  const jobIds = [...new Set(groups.map((g) => g.researchJobId).filter((id): id is string => Boolean(id)))];
  const jobById = new Map<string, { requested_name?: string | null; requested_part_number?: string | null; fleet_count?: number }>();
  if (jobIds.length) {
    const { data, error } = await supabase
      .from("catalog_research_job")
      .select("id, requested_name, requested_part_number, fleet_count")
      .in("id", jobIds);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; requested_name?: string | null; requested_part_number?: string | null; fleet_count?: number };
      jobById.set(String(r.id), r);
    }
  }
  return groups.map((g) => {
    const job = g.researchJobId ? jobById.get(g.researchJobId) : undefined;
    return {
      ...g,
      requestedName: job?.requested_name ?? null,
      requestedPartNumber: job?.requested_part_number ?? null,
      sortFleetCount: Number(job?.fleet_count ?? 0),
    };
  });
}

export function registerPendingPartsCatalogRoutes(app: { get: Function; patch: Function }, supabase: SupabaseClient) {
  const guard = (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    // Reads: any Dominion staff (owner, support, analyst). Writes check catalog.write on their own.
    return null;
  };

  app.get(PREFIX, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("parts_sourcing_requests")
        .select(
          "id, platform_id, vehicle_catalog_id, maintenance_component_id, install_side, install_position, fit_descriptor, match_type, status, created_at, photo_url, need_text, looking_note, resolution_note, kind, research_group_key, origin, old_part_number, position_scheme, position_codes, catalog_research_job_id",
        )
        .eq("kind", "add_part_info")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      let groups = groupPartsRequests((data || []) as Array<Record<string, unknown>>);
      groups = await enrichPendingPartsGroupsWithJobs(supabase, groups);
      groups.sort((a, b) => {
        const byCount = b.sortFleetCount - a.sortFleetCount;
        if (byCount !== 0) return byCount;
        return String(b.lastAsked ?? "").localeCompare(String(a.lastAsked ?? ""));
      });
      const safe = groups.map((group) => {
        const { sortFleetCount: _sort, ...pub } = group;
        return stripPii(pub as unknown as Record<string, unknown>);
      });
      const global = await getPlatformSettingsCached("global");
      const weeklyTarget = Math.max(
        1,
        Math.min(999, Number(global.pendingPartsWeeklyTarget) || 12),
      );
      return c.json({ items: safe, total: safe.length, weeklyTarget });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get(`${PREFIX}/:groupId/candidates`, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    try {
      const groupId = c.req.param("groupId");
      if (groupId.startsWith("legacy:")) return c.json({ items: [] });
      let query = supabase
        .from("parts_sourcing_requests")
        .select(
          "vehicle_catalog_id, maintenance_component_id, position_scheme, position_codes, need_text",
        )
        .eq("kind", "add_part_info")
        .limit(1);
      applyPendingPartsGroupFilter(query, groupId);
      const { data, error } = await query;
      if (error) throw error;
      const first = (data?.[0] ?? null) as {
        vehicle_catalog_id?: string | null;
        maintenance_component_id?: string | null;
        position_codes?: string[] | null;
        need_text?: string | null;
      } | null;
      if (!first?.vehicle_catalog_id || !first.maintenance_component_id) {
        return c.json({ items: [] });
      }
      const split = splitPlacesForFind(Array.isArray(first.position_codes) ? first.position_codes.map(String) : []);
      const found = await findParts(supabase, {
        variantId: String(first.vehicle_catalog_id),
        componentId: String(first.maintenance_component_id),
        fitPairs: split.wheelPairs.length ? split.wheelPairs : null,
        placeCodes: split.placeCodes,
        attachFitLabels: true,
      });
      const listed = found.plainSections.flatMap((section) => section.items).map((item) => ({
        partId: String(item.partId),
        name: item.name,
        brand: item.brand,
        number: item.number,
        place: item.listingPlace ?? item.position,
        fitLabel: (item.fitLabel ?? fitLabelForPart(item)) as string,
      }));
      // LC-21: a by-size part is listed by its universal_part id; the resolve needs its part_master twin.
      const twins = await universalTwinIds(supabase, listed.filter((p) => p.fitLabel === "fits_by_size").map((p) => p.partId));
      const items = candidateItems(
        listed,
        twins,
        // What the user typed (Log service "Add … as the battery I used"): close matches of this job, even when
        // not listed for this car — the part really in the car (Dominion staff only; never shown to customers).
        first.need_text ? await findPartMatches(supabase, String(first.maintenance_component_id), String(first.need_text)) : [],
      ).map((p) => stripPii(p));
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get(`${PREFIX}/:groupId`, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    try {
      const groupId = c.req.param("groupId");
      let query = supabase
        .from("parts_sourcing_requests")
        .select(
          "id, platform_id, vehicle_catalog_id, maintenance_component_id, install_side, install_position, fit_descriptor, match_type, need_text, photo_url, created_at, status, looking_note, resolution_note, kind, catalog_research_job_id, research_group_key, origin, old_part_number, position_scheme, position_codes",
        )
        .eq("kind", "add_part_info");
      applyPendingPartsGroupFilter(query, groupId);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      const notes = rows.map((row, index) => stripPii({
        id: row.id,
        logRef: `${String(row.id).slice(0, 8).toUpperCase()}-${String.fromCharCode(65 + (index % 26))}`,
        text: String((row as { need_text?: string }).need_text || ""),
        at: (row as { created_at?: string }).created_at,
      } as Record<string, unknown>));
      let onFile: ReturnType<typeof mapPendingOnFileParts> = [];
      const first = rows[0] as {
        vehicle_catalog_id?: string | null;
        maintenance_component_id?: string | null;
        origin?: string | null;
        position_scheme?: string | null;
        position_codes?: string[] | null;
        old_part_number?: string | null;
      } | undefined;
      const catalogId = first?.vehicle_catalog_id ? String(first.vehicle_catalog_id) : "";
      const componentId = first?.maintenance_component_id ? String(first.maintenance_component_id) : "";
      if (catalogId && componentId) {
        const { data: vcRow } = await supabase
          .from("vehicle_catalog")
          .select("production_start_year")
          .eq("id", catalogId)
          .maybeSingle();
        const vehicleYear = (vcRow as { production_start_year?: number | null } | null)?.production_start_year ?? null;
        const catalog = await getCatalogParts(supabase, catalogId, {
          componentId,
          vehicleYear,
        });
        onFile = mapPendingOnFileParts(catalog.items);
      }
      const researchJobId = (rows[0] as { catalog_research_job_id?: string | null } | undefined)?.catalog_research_job_id ?? null;
      let requestedName: string | null = null;
      let requestedPartNumber: string | null = null;
      if (researchJobId) {
        const { data: jobRow } = await supabase
          .from("catalog_research_job")
          .select("requested_name, requested_part_number")
          .eq("id", researchJobId)
          .maybeSingle();
        requestedName = (jobRow as { requested_name?: string })?.requested_name ?? null;
        requestedPartNumber = (jobRow as { requested_part_number?: string })?.requested_part_number ?? null;
      }
      const origins = sortOrigins(rows.map((r) => String((r as { origin?: string }).origin || "find_parts")));
      return c.json({
        groupId,
        researchJobId,
        requestedName,
        requestedPartNumber,
        positionScheme: first?.position_scheme ?? null,
        positionCodes: Array.isArray(first?.position_codes) ? first.position_codes.map(String) : null,
        origins,
        notes,
        photos: rows.filter((row) => (row as { photo_url?: string }).photo_url).map((row) => stripPii({
          url: (row as { photo_url?: string }).photo_url,
          requestId: (row as { id?: string }).id,
        } as Record<string, unknown>)),
        onFile,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.patch(`${PREFIX}/:groupId`, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    const writeDenied = dominionCan((c.get("rbacUser") as { resolvedRole?: string })?.resolvedRole, "catalog.write")
      ? null
      : c.json({ error: "Forbidden" }, 403);
    if (writeDenied) return writeDenied;
    try {
      const groupId = c.req.param("groupId");
      const body = await c.req.json() as Record<string, unknown>;
      const action = String(body.action || "");
      const now = new Date().toISOString();
      const user = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
      const actorId = user?.userId ?? user?.id ?? null;

      // Code review #3: only the group's still-open asks change. v2 keys are fixed, so the same key can also hold
      // asks that were already resolved (part on file) or answered; those are never overwritten.
      const applyUpdate = async (patch: Record<string, unknown>): Promise<string[]> => {
        let query = supabase
          .from("parts_sourcing_requests")
          .update(patch)
          .eq("kind", "add_part_info")
          .in("status", OPEN_REQUEST_STATUSES);
        applyPendingPartsGroupFilter(query, groupId);
        const { data, error } = await query.select("id");
        if (error) throw error;
        return (data ?? []).map((r: { id: string }) => String(r.id));
      };

      if (action === "looking") {
        await applyUpdate({
          status: "in_progress",
          looking_at: now,
          looking_note: String(body.note || "").slice(0, 2000) || null,
          assigned_to: actorId,
        });
      } else if (action === "cant_find") {
        const changed = await applyUpdate({
          status: "rejected",
          cant_find_at: now,
          cant_find_reason: String(body.reason || "").slice(0, 500) || null,
        });
        // Only the companies whose open ask was just answered are told (never one whose part is already on file).
        if (changed.length) await notifyFleetsRequestOutcome(supabase, groupId, "not_found", changed);
      } else if (action === "added") {
        if (groupId.startsWith("legacy:")) {
          return c.json({ code: "legacy_group", error: "Legacy group cannot be resolved this way." }, 400);
        }
        const partId = String(body.partId ?? body.part_id ?? "").trim();
        if (!partId) return c.json({ error: "partId is required" }, 400);
        // Code review #6: a malformed id is a 400, not a raw database error.
        if (!UUID_RE.test(partId)) return c.json({ code: "part_id_invalid", error: "That part id isn't valid." }, 400);
        const { data, error } = await supabase.rpc("catalog_resolve_request_group", {
          p_group_key: groupId,
          p_part_id: partId,
          p_actor_id: actorId,
        });
        if (error) {
          const msg = error.message ?? String(error);
          if (msg.includes("part_not_found")) {
            return c.json({ error: "Part not found" }, 404);
          }
          throw error;
        }
        const row = (data ?? {}) as Record<string, unknown>;
        return c.json({
          ok: true,
          resolved: Number(row.resolved ?? 0),
          companies: Number(row.companies ?? 0),
        });
      } else {
        return c.json({ error: "Unknown action" }, 400);
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}