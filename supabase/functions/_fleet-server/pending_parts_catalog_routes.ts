/**
 * Dominion Pending catalog — Parts tab queue (add_part_info requests).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { getPlatformSettingsCached } from "./platform_settings.ts";
import { applyPendingPartsGroupFilters, pendingPartsGroupKey } from "./pending_parts_group.ts";

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
]);

export function stripPii<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function groupPartsRequests(rows: Array<Record<string, unknown>>) {
  const groups = new Map<string, {
    groupId: string;
    vehicleCatalogId: string | null;
    platformId: string | null;
    componentId: string | null;
    side: string | null;
    fitDescriptor: string | null;
    matchType: string | null;
    fleetCount: number;
    firstAsked: string | null;
    lastAsked: string | null;
    photoCount: number;
    status: string;
    requestIds: string[];
  }>();
  for (const row of rows) {
    const vehicleCatalogId = row.vehicle_catalog_id ? String(row.vehicle_catalog_id) : "";
    const platformId = row.platform_id ? String(row.platform_id) : "";
    const componentId = row.maintenance_component_id ? String(row.maintenance_component_id) : "";
    const side = row.install_side ? String(row.install_side) : "";
    const fitDescriptor = row.fit_descriptor ? String(row.fit_descriptor) : "";
    const matchType = row.match_type ? String(row.match_type) : "";
    const groupId = pendingPartsGroupKey(row);
    const created = String(row.created_at || "");
    const existing = groups.get(groupId);
    if (!existing) {
      groups.set(groupId, {
        groupId,
        vehicleCatalogId: vehicleCatalogId || null,
        platformId: platformId || null,
        componentId: componentId || null,
        side: side || null,
        fitDescriptor: fitDescriptor || null,
        matchType: matchType || null,
        fleetCount: 1,
        firstAsked: created || null,
        lastAsked: created || null,
        photoCount: row.photo_url ? 1 : 0,
        status: String(row.status || "open"),
        requestIds: [String(row.id)],
      });
      continue;
    }
    existing.fleetCount += 1;
    existing.requestIds.push(String(row.id));
    if (created && (!existing.firstAsked || created < existing.firstAsked)) existing.firstAsked = created;
    if (created && (!existing.lastAsked || created > existing.lastAsked)) existing.lastAsked = created;
    if (row.photo_url) existing.photoCount += 1;
  }
  return [...groups.values()];
}

export function registerPendingPartsCatalogRoutes(app: { get: Function; patch: Function }, supabase: SupabaseClient) {
  const guard = (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const user = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
    if (!dominionCan(user?.resolvedRole || user?.role, "catalog.read")) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return null;
  };

  app.get(PREFIX, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("parts_sourcing_requests")
        .select("id, platform_id, vehicle_catalog_id, maintenance_component_id, install_side, install_position, fit_descriptor, match_type, status, created_at, photo_url, need_text, looking_note, resolution_note, kind")
        .eq("kind", "add_part_info")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const groups = groupPartsRequests((data || []) as Array<Record<string, unknown>>);
      const safe = groups.map((group) => stripPii(group as unknown as Record<string, unknown>));
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

  app.get(`${PREFIX}/:groupId`, async (c: Context) => {
    const denied = guard(c);
    if (denied) return denied;
    try {
      const groupId = c.req.param("groupId");
      let query = supabase
        .from("parts_sourcing_requests")
        .select("id, platform_id, vehicle_catalog_id, maintenance_component_id, install_side, fit_descriptor, match_type, need_text, photo_url, created_at, status, looking_note, resolution_note, kind")
        .eq("kind", "add_part_info");
      applyPendingPartsGroupFilters(query, groupId);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw error;
      const notes = (data || []).map((row, index) => stripPii({
        id: row.id,
        logRef: `${String(row.id).slice(0, 8).toUpperCase()}-${String.fromCharCode(65 + (index % 26))}`,
        text: String((row as { need_text?: string }).need_text || ""),
        at: (row as { created_at?: string }).created_at,
      } as Record<string, unknown>));
      return c.json({
        groupId,
        fleetCount: notes.length,
        notes,
        photos: (data || []).filter((row) => (row as { photo_url?: string }).photo_url).map((row) => stripPii({
          url: (row as { photo_url?: string }).photo_url,
          requestId: (row as { id?: string }).id,
        } as Record<string, unknown>)),
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
      const user = c.get("rbacUser") as { id?: string } | undefined;

      const applyUpdate = async (patch: Record<string, unknown>) => {
        let query = supabase.from("parts_sourcing_requests").update(patch).eq("kind", "add_part_info");
        applyPendingPartsGroupFilters(query, groupId);
        const { error } = await query;
        if (error) throw error;
      };

      if (action === "looking") {
        await applyUpdate({
          status: "in_progress",
          looking_at: now,
          looking_note: String(body.note || "").slice(0, 2000) || null,
          assigned_to: user?.id ?? null,
        });
      } else if (action === "cant_find") {
        await applyUpdate({
          status: "rejected",
          cant_find_at: now,
          cant_find_reason: String(body.reason || "").slice(0, 500) || null,
        });
      } else if (action === "added") {
        await applyUpdate({
          status: "resolved",
          added_at: now,
          resolved_part_id: String(body.resolvedPartId || "") || null,
          resolution_note: String(body.note || "").slice(0, 2000) || null,
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
