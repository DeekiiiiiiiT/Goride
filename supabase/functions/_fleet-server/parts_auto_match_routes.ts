import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  assertPlatformStaffResponse,
  hasPlatformOwnerAccess,
  requireAuth,
  requirePermission,
} from "./rbac_middleware.ts";
import type { RbacUser } from "./rbac_middleware.ts";
import { normalizePartNumberNorm } from "./catalog_research_number_shape.ts";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE = "/make-server-37f42386/admin/auto-match";
const ADMIN = "/make-server-37f42386/admin";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export function parseOptionalVehicleId(raw: string | undefined): { ok: true; id: string | null } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: true, id: null };
  const id = raw.trim();
  if (!isValidUuid(id)) return { ok: false, error: "Invalid vehicle id" };
  return { ok: true, id };
}

export function parseConflictResolveInput(body: unknown):
  | { ok: true; action: "keep" | "remove"; note: string }
  | { ok: false; error: string } {
  const b = (body && typeof body === "object") ? body as { action?: string; note?: string } : {};
  const action = String(b.action ?? "").trim().toLowerCase();
  const note = String(b.note ?? "").trim();
  if (action !== "keep" && action !== "remove") return { ok: false, error: "Choose keep or remove." };
  return { ok: true, action, note };
}

export function parseKeepBatchInput(body: unknown):
  | { ok: true; ids: string[]; note: string }
  | { ok: false; error: string } {
  const b = (body && typeof body === "object") ? body as { derivedIds?: unknown; note?: string } : {};
  const raw = Array.isArray(b.derivedIds) ? b.derivedIds : [];
  const ids = raw.map((v) => String(v).trim()).filter(Boolean);
  const note = String(b.note ?? "").trim();
  if (!ids.length) return { ok: false, error: "Pick at least one fit." };
  for (const id of ids) {
    if (!isValidUuid(id)) return { ok: false, error: `Invalid fit id: ${id}` };
  }
  return { ok: true, ids, note };
}

export function tallyField(rows: Array<Record<string, unknown>>, field: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[field] ?? "");
    if (!key) continue;
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

export function rpcClientErrorStatus(e: unknown): 400 | 500 {
  if (!e || typeof e !== "object") return 500;
  const err = e as { code?: string; message?: string };
  if (err.code === "P0001") return 400;
  const msg = String(err.message ?? "").toLowerCase();
  if (msg.includes("not found") || msg.includes("invalid") || msg.includes("unknown")) return 400;
  return 500;
}

function fail(c: Context, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  const code = status === 500 ? rpcClientErrorStatus(e) : status;
  return c.json({ error: msg }, (status === 500 ? code : status) as 400 | 403 | 404 | 500);
}

function assertUuid(id: string): string | null {
  const v = id.trim();
  if (!isValidUuid(v)) return null;
  return v;
}

function staffOnly(c: Context): Response | null {
  return assertPlatformStaffResponse(c);
}

function ownerOnly(c: Context): Response | null {
  const denied = staffOnly(c);
  if (denied) return denied;
  const user = c.get("rbacUser") as RbacUser | undefined;
  if (!user || !hasPlatformOwnerAccess(user)) {
    return c.json({ error: "Only the owner can run this." }, 403);
  }
  return null;
}

function actorId(c: Context): string | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ?? null;
}

const importGuard = [requireAuth(), requirePermission("catalog.import")];

async function loadConflictTotals(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("part_match_conflict").select("conflict_type, status");
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    totalsByType: tallyField(rows, "conflict_type"),
    totalsByStatus: tallyField(rows, "status"),
    totalCount: rows.length,
  };
}

async function applyConflictSearch(
  supabase: SupabaseClient,
  q: ReturnType<SupabaseClient["from"]>,
  search: string,
) {
  const term = search.trim();
  if (!term) return q;
  const like = `%${term}%`;
  const [cars, parts, groups] = await Promise.all([
    supabase.from("vehicle_catalog").select("id").or(
      `make.ilike.${like},model.ilike.${like},chassis_code.ilike.${like},catalog_trim.ilike.${like}`,
    ).limit(50),
    supabase.from("part_master").select("id").or(
      `oem_part_number.ilike.${like},name.ilike.${like},manufacturer.ilike.${like}`,
    ).limit(50),
    supabase.from("part_interchange_group").select("id").ilike("code", like).limit(50),
  ]);
  if (cars.error) throw cars.error;
  if (parts.error) throw parts.error;
  if (groups.error) throw groups.error;
  const carIds = (cars.data ?? []).map((r) => (r as { id: string }).id);
  const partIds = (parts.data ?? []).map((r) => (r as { id: string }).id);
  const groupIds = (groups.data ?? []).map((r) => (r as { id: string }).id);
  const clauses = [`matched_key.ilike.${like}`, `code.ilike.${like}`];
  if (carIds.length) clauses.push(`vehicle_catalog_id.in.(${carIds.join(",")})`);
  if (partIds.length) clauses.push(`part_id.in.(${partIds.join(",")})`);
  if (groupIds.length) clauses.push(`interchange_group_id.in.(${groupIds.join(",")})`);
  return q.or(clauses.join(","));
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(","));
  return [header, ...lines].join("\n");
}

async function normalizeOeFields(supabase: SupabaseClient, brand: string, number: string) {
  const oe_number_norm = normalizePartNumberNorm(number);
  const { data: ver, error } = await supabase.rpc("part_import_norm_version");
  if (error) throw error;
  return {
    oe_brand: brand.trim(),
    oe_number: number.trim(),
    oe_number_norm,
    norm_version: Number(ver ?? 1),
  };
}

export function registerPartsAutoMatchRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.get(`${BASE}/health`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const parsed = parseOptionalVehicleId(c.req.query("vehicleId"));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const { data, error } = await supabase.rpc("part_match_health", { p_vehicle_id: parsed.id });
      if (error) throw error;
      return c.json(data ?? {});
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/schedule`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("part_match_schedule");
      if (error) throw error;
      return c.json(data ?? {});
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/conflicts`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const type = c.req.query("type");
      const status = c.req.query("status");
      const search = (c.req.query("q") ?? "").trim();
      const totals = await loadConflictTotals(supabase);
      let q = supabase.from("part_match_conflict").select("*", { count: "exact" })
        .order("computed_at", { ascending: false }).limit(200);
      if (type) q = q.eq("conflict_type", type);
      if (status) q = q.eq("status", status);
      q = await applyConflictSearch(supabase, q, search);
      const { data, error, count } = await q;
      if (error) throw error;
      return c.json({
        rows: data ?? [],
        filteredCount: count ?? (data ?? []).length,
        ...totals,
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/conflicts/heatmap`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_match_conflict")
        .select("conflict_type, status, vehicle_catalog_id")
        .eq("status", "open");
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      return c.json({
        byType: tallyField(rows, "conflict_type"),
        byVehicle: tallyField(rows, "vehicle_catalog_id"),
        openCount: rows.length,
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${BASE}/conflicts/:id/resolve`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid conflict id" }, 400);
      const parsed = parseConflictResolveInput(await c.req.json());
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const fn = parsed.action === "keep" ? "part_match_conflict_keep" : "part_match_conflict_remove";
      const { error } = await supabase.rpc(fn, {
        p_conflict_id: id,
        p_actor: actorId(c),
        p_note: parsed.note,
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/conflicts/resolve-batch`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { items?: Array<{ id?: string; action?: string; note?: string }> };
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return c.json({ error: "Pick at least one conflict." }, 400);
      for (const item of items) {
        const id = assertUuid(String(item.id ?? ""));
        if (!id) return c.json({ error: "Invalid conflict id in batch." }, 400);
        const parsed = parseConflictResolveInput(item);
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
        const fn = parsed.action === "keep" ? "part_match_conflict_keep" : "part_match_conflict_remove";
        const { error } = await supabase.rpc(fn, {
          p_conflict_id: id,
          p_actor: actorId(c),
          p_note: parsed.note,
        });
        if (error) throw error;
      }
      return c.json({ ok: true, resolved: items.length });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/keep-batch`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const parsed = parseKeepBatchInput(await c.req.json());
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      for (const fitId of parsed.ids) {
        const { data: fit, error: fErr } = await supabase.from("part_fit_derived").select("id").eq("id", fitId).maybeSingle();
        if (fErr) throw fErr;
        if (!fit) return c.json({ error: `Unknown derived fit: ${fitId}` }, 400);
        const { error } = await supabase.rpc("part_match_derived_keep", {
          p_derived_id: fitId,
          p_actor: actorId(c),
          p_note: parsed.note,
        });
        if (error) return fail(c, error, rpcClientErrorStatus(error));
      }
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/runs`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
      const { data, error } = await supabase.from("part_match_recompute_log")
        .select("*").order("started_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return c.json({ rows: data ?? [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/catalog/completeness`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("part_match_catalog_completeness");
      if (!rpcErr && rpcData != null) return c.json(rpcData);
      const [vehicles, withOe, links] = await Promise.all([
        supabase.from("vehicle_catalog").select("id", { count: "exact", head: true }),
        supabase.from("vehicle_oe_number").select("vehicle_catalog_id"),
        supabase.from("platform_component_link").select("id", { count: "exact", head: true }),
      ]);
      if (vehicles.error) throw vehicles.error;
      if (withOe.error) throw withOe.error;
      if (links.error) throw links.error;
      const covered = new Set((withOe.data ?? []).map((r) => String((r as { vehicle_catalog_id: string }).vehicle_catalog_id)));
      return c.json({
        vehicleCount: vehicles.count ?? 0,
        vehiclesWithOeNumbers: covered.size,
        vehiclesMissingOe: Math.max(0, (vehicles.count ?? 0) - covered.size),
        platformLinkCount: links.count ?? 0,
        source: rpcErr ? "fallback_counts" : "rpc",
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/position-reports`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const pending = c.req.query("pending") !== "0";
      let q = supabase.from("part_norm_position_backfill_report").select("*").order("created_at", { ascending: false }).limit(500);
      if (pending) q = q.is("resolved_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return c.json({ rows: data ?? [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${BASE}/position-reports/:id/mark-fixed`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid report id" }, 400);
      const { error } = await supabase.rpc("part_norm_position_report_resolve", {
        p_report_id: id,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/position-reports/:id/remap`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid report id" }, 400);
      const body = await c.req.json() as { position?: string; side?: string };
      const position = String(body.position ?? "").trim();
      const side = body.side == null ? null : String(body.side).trim();
      if (!position) return c.json({ error: "Position is required." }, 400);
      const { error } = await supabase.rpc("part_norm_position_report_remap", {
        p_report_id: id,
        p_position: position,
        p_side: side,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.get(`${BASE}/position-reports/export`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_norm_position_backfill_report")
        .select("*").order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const csv = rowsToCsv(rows, [
        "id", "table_name", "row_id", "original_position", "original_side", "reason", "resolved_at", "created_at",
      ]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="position-issue-report.csv"',
        },
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/platforms`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_platforms");
      if (!rpcErr && rpcData != null) return c.json(rpcData);
      const { data, error } = await supabase.from("vehicle_platform").select("*").order("code");
      if (error) throw error;
      return c.json({ platforms: data ?? [], source: rpcErr ? "vehicle_platform" : "rpc" });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/platforms/:id`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid platform id" }, 400);
      const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_platform", { p_platform_id: id });
      if (!rpcErr && rpcData != null) return c.json(rpcData);
      const [platform, links, cars] = await Promise.all([
        supabase.from("vehicle_platform").select("*").eq("id", id).maybeSingle(),
        supabase.from("platform_component_link").select("*").or(`platform_a_id.eq.${id},platform_b_id.eq.${id}`),
        supabase.from("vehicle_catalog").select("id, make, model, chassis_code, catalog_trim").eq("platform_id", id),
      ]);
      if (platform.error) throw platform.error;
      if (links.error) throw links.error;
      if (cars.error) throw cars.error;
      if (!platform.data) return c.json({ error: "Platform not found" }, 404);
      return c.json({
        platform: platform.data,
        links: links.data ?? [],
        vehicles: cars.data ?? [],
        source: "vehicle_platform",
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${BASE}/platforms/:id/links`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const platformId = assertUuid(c.req.param("id"));
      if (!platformId) return c.json({ error: "Invalid platform id" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const otherId = assertUuid(String(body.platform_b_id ?? body.otherPlatformId ?? ""));
      const componentId = assertUuid(String(body.maintenance_component_id ?? body.componentId ?? ""));
      if (!otherId || !componentId) return c.json({ error: "Platform and component are required." }, 400);
      const evidence = String(body.evidence_url ?? body.evidenceUrl ?? "").trim();
      if (!evidence) return c.json({ error: "Evidence URL is required." }, 400);
      const row = {
        platform_a_id: platformId,
        platform_b_id: otherId,
        scope: String(body.scope ?? "component") === "system" ? "system" : "component",
        maintenance_component_id: componentId,
        position: body.position ? String(body.position) : null,
        side: body.side ? String(body.side) : null,
        evidence_url: evidence,
        note: body.note ? String(body.note) : null,
        created_by: actorId(c),
      };
      const { data, error } = await supabase.from("platform_component_link").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ row: data });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.patch(`${BASE}/platforms/:id/links/:linkId`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const linkId = assertUuid(c.req.param("linkId"));
      if (!linkId) return c.json({ error: "Invalid link id" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (body.evidence_url != null || body.evidenceUrl != null) {
        patch.evidence_url = String(body.evidence_url ?? body.evidenceUrl).trim();
      }
      if (body.note != null) patch.note = String(body.note);
      if (body.scope != null) patch.scope = String(body.scope) === "system" ? "system" : "component";
      const { data, error } = await supabase.from("platform_component_link").update(patch).eq("id", linkId).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "Link not found" }, 404);
      return c.json({ row: data });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.delete(`${BASE}/platforms/:id/links/:linkId`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const linkId = assertUuid(c.req.param("linkId"));
      if (!linkId) return c.json({ error: "Invalid link id" }, 400);
      const { error, count } = await supabase.from("platform_component_link").delete({ count: "exact" }).eq("id", linkId);
      if (error) throw error;
      if (!count) return c.json({ error: "Link not found" }, 404);
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/platforms/:id/export`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid platform id" }, 400);
      const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_platform_export", { p_platform_id: id });
      if (!rpcErr && rpcData != null) return c.json(rpcData);
      const { data: links, error } = await supabase.from("platform_component_link").select("*")
        .or(`platform_a_id.eq.${id},platform_b_id.eq.${id}`);
      if (error) throw error;
      return c.json({ platformId: id, links: links ?? [], format: "matrix" });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${ADMIN}/catalog/find-parts/rematch`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const parsed = parseOptionalVehicleId(c.req.query("vehicleId"));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const { error } = await supabase.rpc("part_match_recompute", {
        p_group_id: null,
        p_vehicle_id: parsed.id,
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/catalog/find-parts/export`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const parsed = parseOptionalVehicleId(c.req.query("vehicleId") ?? c.req.query("variantId"));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      if (!parsed.id) return c.json({ error: "vehicleId is required" }, 400);
      const componentRaw = c.req.query("componentId");
      const componentId = componentRaw?.trim() ? assertUuid(componentRaw) : null;
      if (componentRaw?.trim() && !componentId) return c.json({ error: "Invalid component id" }, 400);
      const yearRaw = c.req.query("year");
      const vehicleYear = yearRaw ? Number(yearRaw) : null;
      const { data, error } = await supabase.rpc("parts_for_vehicle", {
        p_catalog_id: parsed.id,
        p_component_id: componentId,
        p_vehicle_year: vehicleYear,
      });
      if (error) throw error;
      const format = (c.req.query("format") ?? "json").toLowerCase();
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (format === "csv") {
        const csv = rowsToCsv(rows, [
          "tier", "part_id", "part_name", "oem_part_number", "manufacturer", "position", "side",
          "fit_source", "via", "match_reason_code", "match_status",
        ]);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="find-parts-export.csv"',
          },
        });
      }
      return c.json({ rows });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${BASE}/run-audit`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const { error } = await supabase.rpc("part_match_recompute", { p_group_id: null, p_vehicle_id: null });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/vehicles/:id/oe-numbers`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const { data, error } = await supabase.rpc("admin_vehicle_oe_numbers", { p_vehicle: vid });
      if (error) throw error;
      return c.json(data ?? {});
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${ADMIN}/vehicles/:id/oe-numbers`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const componentId = assertUuid(String(body.maintenance_component_id ?? ""));
      if (!componentId) return c.json({ error: "Component is required." }, 400);
      const brand = String(body.oe_brand ?? body.brand ?? "").trim();
      const number = String(body.oe_number ?? body.number ?? "").trim();
      const evidence = String(body.evidence_url ?? "").trim();
      if (!brand || !number || !evidence) return c.json({ error: "Brand, number, and evidence URL are required." }, 400);
      const norm = await normalizeOeFields(supabase, brand, number);
      const { data, error } = await supabase.from("vehicle_oe_number").insert({
        vehicle_catalog_id: vid,
        maintenance_component_id: componentId,
        position: body.position ? String(body.position) : null,
        side: body.side ? String(body.side) : null,
        year_from: body.year_from != null ? Number(body.year_from) : null,
        year_to: body.year_to != null ? Number(body.year_to) : null,
        evidence_url: evidence,
        note: body.note ? String(body.note) : null,
        created_by: actorId(c),
        ...norm,
      }).select("*").single();
      if (error) throw error;
      return c.json({ row: data });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.patch(`${ADMIN}/vehicles/:id/oe-numbers/:oeId`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      const oeId = assertUuid(c.req.param("oeId"));
      if (!vid || !oeId) return c.json({ error: "Invalid id" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.maintenance_component_id) {
        const cid = assertUuid(String(body.maintenance_component_id));
        if (!cid) return c.json({ error: "Invalid component id" }, 400);
        patch.maintenance_component_id = cid;
      }
      if (body.position != null) patch.position = body.position ? String(body.position) : null;
      if (body.side != null) patch.side = body.side ? String(body.side) : null;
      if (body.year_from != null) patch.year_from = Number(body.year_from);
      if (body.year_to != null) patch.year_to = Number(body.year_to);
      if (body.note != null) patch.note = String(body.note);
      if (body.evidence_url != null) patch.evidence_url = String(body.evidence_url).trim();
      if (body.oe_brand != null || body.oe_number != null || body.brand != null || body.number != null) {
        const brand = String(body.oe_brand ?? body.brand ?? "").trim();
        const number = String(body.oe_number ?? body.number ?? "").trim();
        if (!brand || !number) return c.json({ error: "Brand and number must stay paired." }, 400);
        Object.assign(patch, await normalizeOeFields(supabase, brand, number));
      }
      const { data, error } = await supabase.from("vehicle_oe_number").update(patch)
        .eq("id", oeId).eq("vehicle_catalog_id", vid).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "OE number not found" }, 404);
      return c.json({ row: data });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.delete(`${ADMIN}/vehicles/:id/oe-numbers/:oeId`, ...importGuard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      const oeId = assertUuid(c.req.param("oeId"));
      if (!vid || !oeId) return c.json({ error: "Invalid id" }, 400);
      const { error, count } = await supabase.from("vehicle_oe_number").delete({ count: "exact" })
        .eq("id", oeId).eq("vehicle_catalog_id", vid);
      if (error) throw error;
      if (!count) return c.json({ error: "OE number not found" }, 404);
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${ADMIN}/oe-numbers/normalize`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { brand?: string; oe_number?: string; number?: string; position?: string; side?: string };
      const brand = String(body.brand ?? body.oe_brand ?? "").trim();
      const number = String(body.oe_number ?? body.number ?? "").trim();
      if (!number) return c.json({ error: "Number is required." }, 400);
      const norm = await normalizeOeFields(supabase, brand || "UNKNOWN", number);
      let position: string | null = null;
      let side: string | null = null;
      if (body.position != null || body.side != null) {
        const { data: posData, error: posErr } = await supabase.rpc("part_norm_position", {
          p_position: body.position ?? null,
          p_side: body.side ?? null,
        });
        if (posErr) throw posErr;
        const row = Array.isArray(posData) ? posData[0] : posData;
        position = (row as { norm_position?: string } | null)?.norm_position ?? null;
        side = (row as { norm_side?: string } | null)?.norm_side ?? null;
      }
      return c.json({ ...norm, position, side });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/vehicles/:id/derived-fits`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const { data, error } = await supabase.from("part_fit_derived").select("*")
        .eq("vehicle_catalog_id", vid).order("computed_at", { ascending: false }).limit(500);
      if (error) throw error;
      return c.json({ rows: data ?? [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/vehicles/:id/revisions`, ...importGuard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const { data: oeRows, error: oeErr } = await supabase.from("vehicle_oe_number").select("id").eq("vehicle_catalog_id", vid);
      if (oeErr) throw oeErr;
      const ids = (oeRows ?? []).map((r) => (r as { id: string }).id);
      if (!ids.length) return c.json({ rows: [] });
      const { data, error } = await supabase.from("vehicle_oe_number_revision").select("*")
        .in("vehicle_oe_number_id", ids).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return c.json({ rows: data ?? [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  const bindPartRefs = (
    segment: "oe-references" | "index-numbers" | "approvals",
    table: "part_oe_reference" | "part_index_number" | "part_approval",
  ) => {
    route.get(`${ADMIN}/parts/:id/${segment}`, ...importGuard, async (c: Context) => {
      const denied = staffOnly(c);
      if (denied) return denied;
      try {
        const pid = assertUuid(c.req.param("id"));
        if (!pid) return c.json({ error: "Invalid part id" }, 400);
        const { data, error } = await supabase.from(table).select("*").eq("part_id", pid).order("created_at", { ascending: false });
        if (error) throw error;
        return c.json({ rows: data ?? [] });
      } catch (e) {
        return fail(c, e);
      }
    });

    route.post(`${ADMIN}/parts/:id/${segment}`, ...importGuard, async (c: Context) => {
      const denied = ownerOnly(c);
      if (denied) return denied;
      try {
        const pid = assertUuid(c.req.param("id"));
        if (!pid) return c.json({ error: "Invalid part id" }, 400);
        const body = await c.req.json() as Record<string, unknown>;
        const evidence = String(body.evidence_url ?? "").trim();
        if (!evidence) return c.json({ error: "Evidence URL is required." }, 400);
        let row: Record<string, unknown> = { part_id: pid, evidence_url: evidence, created_by: actorId(c) };
        if (table === "part_oe_reference") {
          const brand = String(body.oe_brand ?? "").trim();
          const number = String(body.oe_number ?? "").trim();
          const refType = String(body.reference_type ?? "cross_ref");
          if (!brand || !number) return c.json({ error: "Brand and number are required." }, 400);
          Object.assign(row, await normalizeOeFields(supabase, brand, number), { reference_type: refType });
        } else if (table === "part_index_number") {
          const indexType = String(body.index_type ?? "wva");
          const value = String(body.value ?? "").trim();
          if (!value) return c.json({ error: "Index value is required." }, 400);
          row = {
            ...row,
            index_type: indexType,
            value,
            value_norm: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
            wear_sensor: String(body.wear_sensor ?? "none"),
          };
        } else {
          const approvalType = String(body.approval_type ?? "ece_r90");
          const value = String(body.value ?? "").trim();
          if (!value) return c.json({ error: "Approval value is required." }, 400);
          row = {
            ...row,
            approval_type: approvalType,
            value,
            value_norm: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          };
        }
        const { data, error } = await supabase.from(table).insert(row).select("*").single();
        if (error) throw error;
        return c.json({ row: data });
      } catch (e) {
        return fail(c, e, rpcClientErrorStatus(e));
      }
    });

    route.patch(`${ADMIN}/parts/:id/${segment}/:refId`, ...importGuard, async (c: Context) => {
      const denied = ownerOnly(c);
      if (denied) return denied;
      try {
        const pid = assertUuid(c.req.param("id"));
        const refId = assertUuid(c.req.param("refId"));
        if (!pid || !refId) return c.json({ error: "Invalid id" }, 400);
        const body = await c.req.json() as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (body.evidence_url != null) patch.evidence_url = String(body.evidence_url).trim();
        if (table === "part_oe_reference" && (body.oe_brand != null || body.oe_number != null)) {
          Object.assign(patch, await normalizeOeFields(
            supabase,
            String(body.oe_brand ?? "").trim(),
            String(body.oe_number ?? "").trim(),
          ));
        }
        if (table === "part_index_number") {
          if (body.value != null) {
            const value = String(body.value).trim();
            patch.value = value;
            patch.value_norm = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          }
          if (body.wear_sensor != null) patch.wear_sensor = String(body.wear_sensor);
        }
        if (table === "part_approval" && body.value != null) {
          const value = String(body.value).trim();
          patch.value = value;
          patch.value_norm = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        }
        const { data, error } = await supabase.from(table).update(patch).eq("id", refId).eq("part_id", pid).select("*").maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Row not found" }, 404);
        return c.json({ row: data });
      } catch (e) {
        return fail(c, e, rpcClientErrorStatus(e));
      }
    });

    route.delete(`${ADMIN}/parts/:id/${segment}/:refId`, ...importGuard, async (c: Context) => {
      const denied = ownerOnly(c);
      if (denied) return denied;
      try {
        const pid = assertUuid(c.req.param("id"));
        const refId = assertUuid(c.req.param("refId"));
        if (!pid || !refId) return c.json({ error: "Invalid id" }, 400);
        const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id", refId).eq("part_id", pid);
        if (error) throw error;
        if (!count) return c.json({ error: "Row not found" }, 404);
        return c.json({ ok: true });
      } catch (e) {
        return fail(c, e);
      }
    });
  };

  bindPartRefs("oe-references", "part_oe_reference");
  bindPartRefs("index-numbers", "part_index_number");
  bindPartRefs("approvals", "part_approval");

  route.patch(`${ADMIN}/platform-feature-flags/parts_auto_match_enabled`, requireAuth(), async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { enabled?: boolean };
      const { error } = await supabase.from("platform_feature_flags").upsert({
        name: "parts_auto_match_enabled",
        enabled: Boolean(body.enabled),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return c.json({ ok: true, enabled: Boolean(body.enabled) });
    } catch (e) {
      return fail(c, e);
    }
  });
}
