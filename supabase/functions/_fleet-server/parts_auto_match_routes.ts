import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  assertPlatformStaffResponse,
  hasPlatformOwnerAccess,
  platformMfaRequiredResponse,
  requireAuth,
  requirePermission,
} from "./rbac_middleware.ts";
import type { RbacUser } from "./rbac_middleware.ts";
import { normalizePartNumberNorm } from "./catalog_research_number_shape.ts";
import { FEATURE_FLAGS } from "./feature_flags.ts";

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

export function enrichPartMatchHealthPayload(data: Record<string, unknown>): Record<string, unknown> {
  const engineVersion = Number(data.engineVersion ?? 0);
  const normVersion = Number(data.normVersion ?? 0);
  return {
    ...data,
    engineHash: `#F${engineVersion}${normVersion}-99A`,
  };
}

export function parseOptionalVehicleId(raw: string | undefined): { ok: true; id: string | null } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: true, id: null };
  const id = raw.trim();
  if (!isValidUuid(id)) return { ok: false, error: "Invalid vehicle id" };
  return { ok: true, id };
}

export function parseConflictResolveInput(body: unknown):
  | { ok: true; action: "keep" | "remove" | "merge"; note: string }
  | { ok: false; error: string } {
  const b = (body && typeof body === "object") ? body as { action?: string; note?: string } : {};
  const action = String(b.action ?? "").trim().toLowerCase();
  const note = String(b.note ?? "").trim();
  if (action !== "keep" && action !== "remove" && action !== "merge") {
    return { ok: false, error: "Choose keep, remove, or merge." };
  }
  if (action === "merge" && !note) {
    return { ok: false, error: "Add a note for the audit trail." };
  }
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

export function supabaseErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const err = e as { message?: string; details?: string; hint?: string };
    const msg = String(err.message ?? "").trim();
    if (msg && msg !== "[object Object]") return msg;
    const details = String(err.details ?? "").trim();
    if (details) return details;
    const hint = String(err.hint ?? "").trim();
    if (hint) return hint;
  }
  return String(e ?? "Unknown error");
}

export function rpcClientErrorStatus(e: unknown): 400 | 500 {
  if (!e || typeof e !== "object") return 500;
  const err = e as { code?: string; message?: string; details?: string };
  if (err.code === "P0001") return 400;
  if (err.code === "23514") return 400;
  const msg = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  if (msg.includes("violates check constraint")) return 400;
  if (msg.includes("not found") || msg.includes("invalid") || msg.includes("unknown")) return 400;
  return 500;
}

function fail(c: Context, e: unknown, status = 500) {
  const msg = supabaseErrorMessage(e);
  const code = status === 500 ? rpcClientErrorStatus(e) : status;
  return c.json({ error: msg }, (status === 500 ? code : status) as 400 | 403 | 404 | 500);
}

/** Strip characters that break PostgREST `.or()` filter lists. */
export function escapePostgrestOrTerm(raw: string): string {
  return raw.trim().replace(/[%_,()]/g, "");
}

export function mapPartMatchSchedule(data: unknown): Record<string, unknown> {
  const raw = (data && typeof data === "object") ? data as Record<string, unknown> : {};
  const cron = String(raw.cron ?? raw.cronSchedule ?? "0 3 * * *");
  const intervalLabel = String(raw.intervalLabel ?? "");
  return {
    nextRun: raw.nextRun ?? null,
    cron,
    jobname: String(raw.jobname ?? raw.jobName ?? "part-match-nightly"),
    intervalLabel: intervalLabel || (cron === "0 3 * * *" ? "Daily at 03:00 UTC" : `Interval · ${cron}`),
  };
}

export async function preflightDerivedKeepBatch(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.from("part_fit_derived").select("id").in("id", ids);
  if (error) throw error;
  const found = new Set((data ?? []).map((row) => String((row as { id: string }).id)));
  if (found.size !== ids.length) {
    const missing = ids.find((id) => !found.has(id));
    return { ok: false, error: `Unknown derived fit: ${missing}` };
  }
  return { ok: true };
}

async function partsAutoMatchEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data: rpcFlag, error: rpcErr } = await supabase.rpc("parts_auto_match_enabled");
  if (!rpcErr && rpcFlag != null) return Boolean(rpcFlag);
  const { data: row, error } = await supabase
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", FEATURE_FLAGS.PARTS_AUTO_MATCH_ENABLED)
    .maybeSingle();
  if (error) throw error;
  return Boolean(row?.enabled);
}

async function requireAutoMatchEngine(c: Context, supabase: SupabaseClient): Promise<Response | null> {
  const enabled = await partsAutoMatchEnabled(supabase);
  if (!enabled) {
    return c.json({ error: "Parts auto-match is disabled." }, 403);
  }
  return null;
}

async function normalizePositionSideWrite(
  supabase: SupabaseClient,
  position?: unknown,
  side?: unknown,
): Promise<{ position: string | null; side: string | null }> {
  if (position == null && side == null) return { position: null, side: null };
  const { data, error } = await supabase.rpc("part_norm_position", {
    p_position: position == null ? null : String(position),
    p_side: side == null ? null : String(side),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    position: (row as { norm_position?: string | null } | null)?.norm_position ?? null,
    side: (row as { norm_side?: string | null } | null)?.norm_side ?? null,
  };
}

function vehicleCatalogLabel(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const parts = [row.make, row.model, row.chassis_code, row.catalog_trim].map((v) => String(v ?? "").trim()).filter(Boolean);
  return parts.join(" · ");
}

function vehicleCatalogSpecLine(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const chassis = String(row.chassis_code ?? "").trim();
  const engine = String(row.engine_code ?? "").trim();
  const disp = row.engine_displacement_l;
  const fuel = String(row.fuel_type ?? row.fuel_category ?? "").trim();
  const left: string[] = [];
  if (chassis) left.push(`Chassis: ${chassis}`);
  const right = [engine, disp != null && disp !== "" ? `${disp}L` : "", fuel].filter(Boolean).join(" ");
  if (right) left.push(right);
  return left.join(" · ");
}

function hostFromEvidenceUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function revisionDiffRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const fmt = (v: unknown) => {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  for (const row of rows) {
    const oldRow = (row.old_row && typeof row.old_row === "object") ? row.old_row as Record<string, unknown> : {};
    const newRow = (row.new_row && typeof row.new_row === "object") ? row.new_row as Record<string, unknown> : {};
    const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    let added = false;
    for (const field of keys) {
      if (field === "updated_at" || field === "created_at") continue;
      if (JSON.stringify(oldRow[field]) === JSON.stringify(newRow[field])) continue;
      const change = `${field}: ${fmt(oldRow[field])} → ${fmt(newRow[field])}`;
      out.push({
        id: `${String(row.id)}:${field}`,
        vehicle_oe_number_id: row.vehicle_oe_number_id,
        created_at: row.created_at,
        field_name: field,
        old_value: oldRow[field] ?? null,
        new_value: newRow[field] ?? null,
        text: change,
        change,
      });
      added = true;
    }
    if (!added) {
      out.push({
        id: row.id,
        vehicle_oe_number_id: row.vehicle_oe_number_id,
        created_at: row.created_at,
        field_name: "row",
        old_value: "row updated",
        new_value: "row updated",
        text: "row updated",
        change: "row updated",
      });
    }
  }
  return out;
}

function assertUuid(id: string): string | null {
  const v = id.trim();
  if (!isValidUuid(v)) return null;
  return v;
}

export function staffOnly(c: Context): Response | null {
  return assertPlatformStaffResponse(c);
}

function isPlatformCatalogEditor(user: RbacUser): boolean {
  return user.resolvedRole === "platform_catalog_editor" || user.rawRole === "platform_catalog_editor";
}

export function ownerOnly(c: Context): Response | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  if (!user) {
    return c.json({ error: "Unauthorized: No user context" }, 401);
  }
  const denied = isPlatformCatalogEditor(user)
    ? platformMfaRequiredResponse(c, user)
    : staffOnly(c);
  if (denied) return denied;
  if (!hasPlatformOwnerAccess(user)) {
    return c.json({ error: "Only the owner can run this." }, 403);
  }
  return null;
}

function actorId(c: Context): string | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ?? null;
}

const importGuard = [requireAuth(), requirePermission("catalog.import")];

export type PartsAutoMatchRouteGuard = typeof importGuard;

export type RegisterPartsAutoMatchOptions = {
  /** Integration tests: inject rbacUser on context instead of validating JWT. */
  routeGuard?: PartsAutoMatchRouteGuard;
};

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

/** PostgREST `or` filter for the conflict search box, or null when there is no term. */
async function conflictSearchFilter(
  supabase: SupabaseClient,
  search: string,
): Promise<string | null> {
  const term = escapePostgrestOrTerm(search);
  if (!term) return null;
  const like = `%${term}%`;
  const [cars, parts, groups] = await Promise.all([
    supabase.from("vehicle_catalog").select("id").or(
      `make.ilike.${like},model.ilike.${like},chassis_code.ilike.${like},catalog_trim.ilike.${like}`,
    ),
    supabase.from("part_master").select("id").or(
      `oem_part_number.ilike.${like},name.ilike.${like},manufacturer.ilike.${like}`,
    ),
    supabase.from("part_interchange_group").select("id").ilike("code", like),
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
  return clauses.join(",");
}

async function enrichConflictRows(supabase: SupabaseClient, rows: Array<Record<string, unknown>>) {
  const vehicleIds = [...new Set(rows.map((r) => String(r.vehicle_catalog_id ?? "")).filter(Boolean))];
  const partIds = [...new Set(rows.map((r) => String(r.part_id ?? "")).filter(Boolean))];
  const groupIds = new Set<string>();
  for (const row of rows) {
    const gid = String(row.interchange_group_id ?? "");
    if (gid) groupIds.add(gid);
    const detail = row.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const ids = (detail as Record<string, unknown>).group_ids;
      if (Array.isArray(ids)) {
        for (const id of ids) {
          const s = String(id ?? "");
          if (s) groupIds.add(s);
        }
      }
    }
  }
  const oeIds = [...new Set(rows.flatMap((row) => {
    const fromRow = String(row.vehicle_oe_number_id ?? "");
    const detail = row.detail;
    const fromDetail = detail && typeof detail === "object" && !Array.isArray(detail)
      ? String((detail as Record<string, unknown>).vehicle_oe_number_id ?? "")
      : "";
    return [fromRow, fromDetail].filter(Boolean);
  }))];
  const [vehicles, parts, groupParts, groups, listings, oeRows] = await Promise.all([
    vehicleIds.length
      ? supabase.from("vehicle_catalog").select("id, make, model, chassis_code, catalog_trim, engine_code, fuel_type, fuel_category, engine_displacement_l").in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    partIds.length
      ? supabase.from("part_master").select("id, name, evidence_url").in("id", partIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.size
      ? supabase.from("part_master").select("id, name, interchange_group_id, evidence_url").in("interchange_group_id", [...groupIds])
      : Promise.resolve({ data: [], error: null }),
    groupIds.size
      ? supabase.from("part_interchange_group").select("id, code").in("id", [...groupIds])
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length && groupIds.size
      ? supabase.from("part_listing").select("interchange_group_id, vehicle_catalog_id, origin")
        .in("vehicle_catalog_id", vehicleIds)
        .in("interchange_group_id", [...groupIds])
        .in("origin", ["manual", "import"])
      : Promise.resolve({ data: [], error: null }),
    oeIds.length
      ? supabase.from("vehicle_oe_number").select("id, evidence_url, oe_number").in("id", oeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vehicles.error) throw vehicles.error;
  if (parts.error) throw parts.error;
  if (groupParts.error) throw groupParts.error;
  if (groups.error) throw groups.error;
  if (listings.error) throw listings.error;
  if (oeRows.error) throw oeRows.error;
  const vehicleMap = new Map((vehicles.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  const partMap = new Map((parts.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  const groupCodeMap = new Map((groups.data ?? []).map((r) => [String((r as { id: string }).id), String((r as { code?: string }).code ?? "")]));
  const partsByGroup = new Map<string, string[]>();
  for (const p of (groupParts.data ?? []) as Array<{ interchange_group_id?: string; name?: string }>) {
    const gid = String(p.interchange_group_id ?? "");
    if (!gid) continue;
    const list = partsByGroup.get(gid) ?? [];
    const name = String(p.name ?? "").trim();
    if (name) list.push(name);
    partsByGroup.set(gid, list);
  }
  const oeMap = new Map((oeRows.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  const manualListingKey = new Set(
    (listings.data ?? []).map((r) => `${String((r as { vehicle_catalog_id?: string }).vehicle_catalog_id)}:${String((r as { interchange_group_id?: string }).interchange_group_id)}`),
  );
  return rows.map((row) => {
    const vehicleId = String(row.vehicle_catalog_id ?? "");
    const groupId = String(row.interchange_group_id ?? "");
    let manualListingGroupCode: string | null = null;
    if (String(row.conflict_type ?? "") === "oe_ambiguous") {
      const detail = row.detail;
      const groupIdList = detail && typeof detail === "object" && !Array.isArray(detail)
        ? (detail as Record<string, unknown>).group_ids
        : null;
      if (Array.isArray(groupIdList)) {
        for (const otherId of groupIdList) {
          const oid = String(otherId ?? "");
          if (!oid || oid === groupId) continue;
          if (manualListingKey.has(`${vehicleId}:${oid}`)) {
            manualListingGroupCode = groupCodeMap.get(oid) || oid;
            break;
          }
        }
      }
    }
    const vehicleRow = vehicleMap.get(vehicleId);
    const partRow = partMap.get(String(row.part_id ?? ""));
    const detailObj = row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
      ? row.detail as Record<string, unknown>
      : {};
    const groupIdList = Array.isArray(detailObj.group_ids)
      ? detailObj.group_ids.map((id) => String(id ?? "")).filter(Boolean)
      : groupId ? [groupId] : [];
    const involved_groups = groupIdList.map((gid) => ({
      group_id: gid,
      group_code: groupCodeMap.get(gid) || gid,
      subtitle: (partsByGroup.get(gid) ?? []).join(" & ") || String(partRow?.name ?? ""),
    }));
    const oeId = String(row.vehicle_oe_number_id ?? detailObj.vehicle_oe_number_id ?? "");
    const oe = oeMap.get(oeId);
    const evidenceUrl = String(oe?.evidence_url ?? "").trim();
    const matchedKey = String(row.matched_key ?? "");
    const geometryPart = partRow ?? (groupId ? (groupParts.data ?? []).find((p) => String((p as { interchange_group_id?: string }).interchange_group_id) === groupId) : null);
    const geometryImage = String((geometryPart as { evidence_url?: string } | null | undefined)?.evidence_url ?? "").trim();
    return {
      ...row,
      vehicle_label: vehicleCatalogLabel(vehicleRow),
      vehicle_spec_line: vehicleCatalogSpecLine(vehicleRow),
      part_name: String(partRow?.name ?? ""),
      group_code: groupCodeMap.get(groupId) || null,
      manual_listing_group_code: manualListingGroupCode,
      found_at: row.computed_at ?? row.created_at ?? null,
      involved_groups,
      number_label: matchedKey ? `Factory OE: ${matchedKey}` : null,
      number_source_url: evidenceUrl || null,
      number_source_host: evidenceUrl ? hostFromEvidenceUrl(evidenceUrl) : null,
      resolved_at: row.resolved_at ?? null,
      geometry_verification: geometryImage || partRow?.name
        ? {
            title: String(partRow?.name ?? groupCodeMap.get(groupId) ?? "Part spec"),
            image_url: geometryImage || null,
            spec_line: "Confirm thickness tolerance before Keep commit.",
          }
        : null,
    };
  });
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

async function enrichVehicleOePayload(
  supabase: SupabaseClient,
  vehicleId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rows = Array.isArray(payload.rows) ? payload.rows as Array<Record<string, unknown>> : [];
  const componentIds = [...new Set(rows.map((r) => String(r.maintenance_component_id ?? "")).filter(Boolean))];
  const oeIds = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  const [{ data: components, error: compErr }, { data: fits, error: fitErr }, vehicleRes] = await Promise.all([
    componentIds.length
      ? supabase.from("maintenance_service_categories").select("id, name, plain_name, op_code").in("id", componentIds)
      : Promise.resolve({ data: [], error: null }),
    oeIds.length
      ? supabase.from("part_fit_derived").select("vehicle_oe_number_id, status").eq("vehicle_catalog_id", vehicleId).in("vehicle_oe_number_id", oeIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("vehicle_catalog").select("id, platform_id, vehicle_platform(code)").eq("id", vehicleId).maybeSingle(),
  ]);
  if (compErr) throw compErr;
  if (fitErr) throw fitErr;
  if (vehicleRes.error) throw vehicleRes.error;
  const compMap = new Map((components ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  const fitCounts = new Map<string, number>();
  for (const fit of (fits ?? []) as Array<{ vehicle_oe_number_id?: string }>) {
    const key = String(fit.vehicle_oe_number_id ?? "");
    if (!key) continue;
    fitCounts.set(key, (fitCounts.get(key) ?? 0) + 1);
  }
  const lastRun = (payload.lastRun && typeof payload.lastRun === "object")
    ? payload.lastRun as Record<string, unknown>
    : null;
  const matching = Boolean(lastRun && !lastRun.finished_at);
  const platformJoin = (vehicleRes.data as { vehicle_platform?: { code?: string } | null } | null)?.vehicle_platform;
  const platformCode = platformJoin?.code ?? null;
  const missingNote = rows.filter((r) => !String((r as { supersession_note?: string }).supersession_note ?? "").trim()
    && String(r.oe_number_norm ?? "").trim());
  let supersessionByNorm = new Map<string, string>();
  if (missingNote.length) {
    const norms = [...new Set(missingNote.map((r) => String(r.oe_number_norm ?? "").trim()).filter(Boolean))];
    const brands = [...new Set(missingNote.map((r) => String(r.oe_brand ?? "").trim()).filter(Boolean))];
    if (norms.length && brands.length) {
      const { data: supRows, error: supErr } = await supabase.from("oe_number_supersession")
        .select("oe_brand, from_norm, to_norm, fully_interchangeable")
        .in("from_norm", norms)
        .in("oe_brand", brands.map((b) => b.toUpperCase()));
      if (supErr) throw supErr;
      for (const s of (supRows ?? []) as Array<{ oe_brand?: string; from_norm?: string; to_norm?: string; fully_interchangeable?: boolean }>) {
        const key = `${String(s.oe_brand ?? "").toUpperCase()}:${String(s.from_norm ?? "")}`;
        supersessionByNorm.set(key, s.fully_interchangeable
          ? `Fully interchangeable with ${s.to_norm}`
          : `Superseded to ${s.to_norm}`);
      }
    }
  }
  const enrichedRows = rows.map((row) => {
    const comp = compMap.get(String(row.maintenance_component_id ?? ""));
    const id = String(row.id ?? "");
    const normKey = `${String(row.oe_brand ?? "").toUpperCase()}:${String(row.oe_number_norm ?? "")}`;
    const noteFromRow = String((row as { supersession_note?: string }).supersession_note ?? "").trim();
    const supersession_note = noteFromRow || supersessionByNorm.get(normKey) || null;
    return {
      ...row,
      part_type_name: String(comp?.plain_name ?? comp?.name ?? ""),
      op_code: comp?.op_code ?? null,
      match_count: fitCounts.get(id) ?? 0,
      matching,
      supersession_note,
      match_status: (row as { match_status?: string }).match_status ?? null,
    };
  });
  const areaDefs = [
    { id: "brakes", label: "Brakes", test: (row: Record<string, unknown>) => /^(BRK|PAD|DSC|ROT)/i.test(String(row.op_code || "")) || /brake|pad|disc|rotor/i.test(String(row.part_type_name || "")) },
    { id: "engine", label: "Engine", test: (row: Record<string, unknown>) => /^(ENG|BLT|SPK|GSK)/i.test(String(row.op_code || "")) || /engine|belt|spark|gasket/i.test(String(row.part_type_name || "")) },
    { id: "filters", label: "Filters", test: (row: Record<string, unknown>) => /^(FLT|OIL)/i.test(String(row.op_code || "")) || /filter|oil/i.test(String(row.part_type_name || "")) },
    { id: "suspension", label: "Suspension", test: (row: Record<string, unknown>) => /^(SUS|SHK|STR)/i.test(String(row.op_code || "")) || /susp|shock|strut/i.test(String(row.part_type_name || "")) },
    { id: "fluids", label: "Fluids", test: (row: Record<string, unknown>) => /^(FLU|CLT)/i.test(String(row.op_code || "")) || /fluid|coolant/i.test(String(row.part_type_name || "")) },
  ];
  const rowsWithAreas = enrichedRows.map((row) => ({
    ...row,
    catalog_area_ids: areaDefs.filter((def) => def.test(row as Record<string, unknown>)).map((def) => def.id),
  }));
  const areaChips = [
    { id: "all", label: "All", count: rowsWithAreas.length },
    ...areaDefs.map((def) => ({
      id: def.id,
      label: def.label,
      count: rowsWithAreas.filter((row) => (row.catalog_area_ids as string[]).includes(def.id)).length,
    })),
  ];
  return { ...payload, rows: rowsWithAreas, platformCode, areaChips };
}

async function enrichDerivedFitRows(supabase: SupabaseClient, vehicleId: string, rows: Array<Record<string, unknown>>) {
  const groupIds = [...new Set(rows.map((r) => String(r.interchange_group_id ?? "")).filter(Boolean))];
  const [{ data: parts, error: partErr }, { data: conflicts, error: confErr }] = await Promise.all([
    groupIds.length
      ? supabase.from("part_master").select("interchange_group_id, name").in("interchange_group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from("part_match_conflict")
        .select("id, interchange_group_id, vehicle_catalog_id, status")
        .eq("vehicle_catalog_id", vehicleId)
        .eq("status", "open")
        .in("interchange_group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (partErr) throw partErr;
  if (confErr) throw confErr;
  const nameByGroup = new Map<string, string>();
  for (const part of (parts ?? []) as Array<{ interchange_group_id?: string; name?: string }>) {
    const gid = String(part.interchange_group_id ?? "");
    if (gid && part.name && !nameByGroup.has(gid)) nameByGroup.set(gid, part.name);
  }
  const conflictByGroup = new Map<string, string>();
  for (const conflict of (conflicts ?? []) as Array<{ id?: string; interchange_group_id?: string }>) {
    const gid = String(conflict.interchange_group_id ?? "");
    if (gid && conflict.id) conflictByGroup.set(gid, String(conflict.id));
  }
  return rows.map((row) => {
    const keys = Array.isArray(row.matched_keys) ? row.matched_keys as string[] : [];
    const gid = String(row.interchange_group_id ?? "");
    return {
      ...row,
      part_name: nameByGroup.get(gid) ?? "",
      matched_key: keys[0] ?? null,
      match_status: row.status ?? null,
      conflict_id: conflictByGroup.get(gid) ?? null,
    };
  });
}

async function enrichPlatformList(supabase: SupabaseClient, platforms: Array<Record<string, unknown>>) {
  if (!platforms.length) return platforms;
  const ids = platforms.map((p) => String(p.id ?? "")).filter(Boolean);
  const [{ data: cars, error: carErr }, { data: links, error: linkErr }] = await Promise.all([
    supabase.from("vehicle_catalog").select("platform_id").in("platform_id", ids),
    supabase.from("platform_component_link").select("platform_a_id, platform_b_id").or(
      `platform_a_id.in.(${ids.join(",")}),platform_b_id.in.(${ids.join(",")})`,
    ),
  ]);
  if (carErr) throw carErr;
  if (linkErr) throw linkErr;
  const carCount = new Map<string, number>();
  for (const row of (cars ?? []) as Array<{ platform_id?: string }>) {
    const id = String(row.platform_id ?? "");
    if (!id) continue;
    carCount.set(id, (carCount.get(id) ?? 0) + 1);
  }
  const linkCount = new Map<string, number>();
  for (const row of (links ?? []) as Array<{ platform_a_id?: string; platform_b_id?: string }>) {
    for (const id of [row.platform_a_id, row.platform_b_id]) {
      const key = String(id ?? "");
      if (!ids.includes(key)) continue;
      linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
    }
  }
  return platforms.map((p) => ({
    ...p,
    maker: p.maker ?? p.primary_maker ?? null,
    car_count: carCount.get(String(p.id ?? "")) ?? 0,
    link_count: linkCount.get(String(p.id ?? "")) ?? 0,
    body_class: p.body_class ?? null,
    market: p.market ?? null,
  }));
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

export function registerPartsAutoMatchRoutes(
  route: RouteApp,
  supabase: SupabaseClient,
  options?: RegisterPartsAutoMatchOptions,
) {
  const guard = options?.routeGuard ?? importGuard;
  route.get(`${BASE}/health`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const parsed = parseOptionalVehicleId(c.req.query("vehicleId"));
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const { data, error } = await supabase.rpc("part_match_health", { p_vehicle_id: parsed.id });
      if (error) throw error;
      const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
      return c.json(enrichPartMatchHealthPayload(payload));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/schedule`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("part_match_schedule");
      if (error) throw error;
      return c.json(mapPartMatchSchedule(data ?? {}));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/conflicts`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const type = c.req.query("type");
      const status = c.req.query("status");
      const search = (c.req.query("q") ?? "").trim();
      const vehicleParsed = parseOptionalVehicleId(c.req.query("vehicleId"));
      if (!vehicleParsed.ok) return c.json({ error: vehicleParsed.error }, 400);
      const totals = await loadConflictTotals(supabase);
      let q = supabase.from("part_match_conflict").select("*", { count: "exact" })
        .order("computed_at", { ascending: false }).limit(200);
      if (type) q = q.eq("conflict_type", type);
      if (status) q = q.eq("status", status);
      if (vehicleParsed.id) q = q.eq("vehicle_catalog_id", vehicleParsed.id);
      // Never await a query builder inside a helper: awaiting runs the query.
      const searchFilter = await conflictSearchFilter(supabase, search);
      if (searchFilter) q = q.or(searchFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = await enrichConflictRows(supabase, (data ?? []) as Array<Record<string, unknown>>);
      return c.json({
        rows,
        filteredCount: count ?? rows.length,
        ...totals,
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/conflicts/heatmap`, ...guard, async (c: Context) => {
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

  route.post(`${BASE}/conflicts/:id/resolve`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid conflict id" }, 400);
      const parsed = parseConflictResolveInput(await c.req.json());
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      if (parsed.action === "merge") {
        const denied = ownerOnly(c);
        if (denied) return denied;
        const { error } = await supabase.rpc("part_match_conflict_merge_same_part", {
          p_conflict_id: id,
          p_actor: actorId(c),
          p_note: parsed.note,
        });
        if (error) throw error;
        return c.json({ ok: true });
      }
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

  route.post(`${BASE}/conflicts/:id/unmerge-same-part`, ...guard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid conflict id" }, 400);
      const { error } = await supabase.rpc("part_match_unmerge_same_part", {
        p_conflict_id: id,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/conflicts/resolve-batch`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const body = await c.req.json() as { items?: Array<{ id?: string; action?: string; note?: string }> };
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return c.json({ error: "Pick at least one conflict." }, 400);
      const payload: Array<{ id: string; action: string; note: string }> = [];
      for (const item of items) {
        const id = assertUuid(String(item.id ?? ""));
        if (!id) return c.json({ error: "Invalid conflict id in batch." }, 400);
        const parsed = parseConflictResolveInput(item);
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
        payload.push({ id, action: parsed.action, note: parsed.note });
      }
      const { data, error } = await supabase.rpc("part_match_conflict_resolve_batch", {
        p_items: payload,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true, resolved: Number(data ?? payload.length) });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/keep-batch`, ...guard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const parsed = parseKeepBatchInput(await c.req.json());
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const preflight = await preflightDerivedKeepBatch(supabase, parsed.ids);
      if (!preflight.ok) return c.json({ error: preflight.error }, 400);
      const { error } = await supabase.rpc("part_match_derived_keep_batch", {
        p_derived_ids: parsed.ids,
        p_actor: actorId(c),
        p_note: parsed.note,
      });
      if (error) return fail(c, error, rpcClientErrorStatus(error));
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/derived/remove-batch`, ...guard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const parsed = parseKeepBatchInput(await c.req.json());
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const preflight = await preflightDerivedKeepBatch(supabase, parsed.ids);
      if (!preflight.ok) return c.json({ error: preflight.error }, 400);
      const { error } = await supabase.rpc("part_match_derived_remove_batch", {
        p_derived_ids: parsed.ids,
        p_actor: actorId(c),
        p_note: parsed.note,
      });
      if (error) return fail(c, error, rpcClientErrorStatus(error));
      return c.json({ ok: true, removed: parsed.ids.length });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.get(`${BASE}/runs`, ...guard, async (c: Context) => {
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

  route.get(`${BASE}/catalog/completeness`, ...guard, async (c: Context) => {
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

  route.get(`${BASE}/catalog/validation-exceptions`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
      const { data, error } = await supabase.from("catalog_validation_exception")
        .select("id, code, detail, affected_ref, source, severity, created_at, import_batch_id")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return c.json({ rows: data ?? [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/position-reports`, ...guard, async (c: Context) => {
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

  route.post(`${BASE}/position-reports/:id/confirm-merge`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid report id" }, 400);
      const body = await c.req.json() as { survivor_id?: string };
      const survivorId = assertUuid(String(body.survivor_id ?? ""));
      if (!survivorId) return c.json({ error: "survivor_id is required." }, 400);
      const { data: row, error: readErr } = await supabase.from("part_norm_position_backfill_report")
        .select("id, reason, survivor_id, resolved_at")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) return c.json({ error: "Report not found" }, 404);
      if (row.resolved_at) return c.json({ error: "Report already resolved." }, 400);
      if (String(row.reason) !== "duplicate_after_normalization") {
        return c.json({ error: "Confirm merge applies to duplicate normalization reports only." }, 400);
      }
      if (String(row.survivor_id ?? "") !== survivorId) {
        return c.json({ error: "survivor_id does not match this report." }, 400);
      }
      const { error } = await supabase.rpc("part_norm_position_report_confirm_merge", {
        p_report_id: id,
        p_survivor_id: survivorId,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.post(`${BASE}/position-reports/:id/mark-fixed`, ...guard, async (c: Context) => {
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

  route.post(`${BASE}/position-reports/:id/remap`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid report id" }, 400);
      const body = await c.req.json() as { position?: string | null; side?: string | null };
      const wantAny = body.position == null || body.position === "any" || body.position === "";
      const normPos = wantAny && (body.side == null || body.side === "any" || body.side === "")
        ? { position: null, side: null }
        : await normalizePositionSideWrite(supabase, body.position, body.side);
      if (!wantAny && !normPos.position) return c.json({ error: "Position is required." }, 400);
      const { error } = await supabase.rpc("part_norm_position_report_remap", {
        p_report_id: id,
        p_position: normPos.position,
        p_side: normPos.side,
        p_actor: actorId(c),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.get(`${BASE}/position-reports/export`, ...guard, async (c: Context) => {
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

  route.get(`${BASE}/platforms`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_platforms");
      if (!rpcErr && rpcData != null) return c.json(rpcData);
      const { data, error } = await supabase.from("vehicle_platform").select("*").order("code");
      if (error) throw error;
      const platforms = await enrichPlatformList(supabase, (data ?? []) as Array<Record<string, unknown>>);
      return c.json({ platforms, items: platforms, source: rpcErr ? "vehicle_platform" : "rpc" });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${BASE}/platforms/:id`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const id = assertUuid(c.req.param("id"));
      if (!id) return c.json({ error: "Invalid platform id" }, 400);
      const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_platform", { p_platform_id: id });
      if (!rpcErr && rpcData != null) {
        const body = rpcData as Record<string, unknown>;
        const links = body.links;
        if (Array.isArray(links) && links.length) {
          const ids = links.map((l) => (l as { id?: string }).id).filter(Boolean) as string[];
          const { data: linkRows } = await supabase.from("platform_component_link")
            .select("id, platform_a_year_from, platform_a_year_to, platform_b_year_from, platform_b_year_to")
            .in("id", ids);
          const byId = new Map((linkRows ?? []).map((r) => [String(r.id), r]));
          body.links = links.map((l) => ({ ...(l as Record<string, unknown>), ...(byId.get(String((l as { id?: string }).id)) ?? {}) }));
        }
        return c.json(body);
      }
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

  route.post(`${BASE}/platforms/:id/links`, ...guard, async (c: Context) => {
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
      const normPos = await normalizePositionSideWrite(supabase, body.position, body.side);
      const row = {
        platform_a_id: platformId,
        platform_b_id: otherId,
        scope: String(body.scope ?? "component") === "system" ? "system" : "component",
        maintenance_component_id: componentId,
        position: normPos.position,
        side: normPos.side,
        evidence_url: evidence,
        note: body.note ? String(body.note) : null,
        platform_a_year_from: body.platform_a_year_from != null ? Number(body.platform_a_year_from) : null,
        platform_a_year_to: body.platform_a_year_to != null ? Number(body.platform_a_year_to) : null,
        platform_b_year_from: body.platform_b_year_from != null ? Number(body.platform_b_year_from) : null,
        platform_b_year_to: body.platform_b_year_to != null ? Number(body.platform_b_year_to) : null,
        created_by: actorId(c),
      };
      const { data, error } = await supabase.from("platform_component_link").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ row: data });
    } catch (e) {
      return fail(c, e, rpcClientErrorStatus(e));
    }
  });

  route.patch(`${BASE}/platforms/:id/links/:linkId`, ...guard, async (c: Context) => {
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

  route.delete(`${BASE}/platforms/:id/links/:linkId`, ...guard, async (c: Context) => {
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

  route.get(`${BASE}/platforms/:id/export`, ...guard, async (c: Context) => {
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

  route.post(`${ADMIN}/catalog/find-parts/rematch`, ...guard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
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

  route.get(`${ADMIN}/catalog/find-parts/export`, ...guard, async (c: Context) => {
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

  route.post(`${BASE}/run-audit`, ...guard, async (c: Context) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const { error } = await supabase.rpc("part_match_recompute", { p_group_id: null, p_vehicle_id: null });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/vehicles/:id/oe-numbers`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const { data, error } = await supabase.rpc("admin_vehicle_oe_numbers", { p_vehicle: vid });
      if (error) throw error;
      const payload = (data && typeof data === "object") ? data as Record<string, unknown> : { rows: [] };
      return c.json(await enrichVehicleOePayload(supabase, vid, payload));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post(`${ADMIN}/vehicles/:id/oe-numbers`, ...guard, async (c: Context) => {
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
      const normPos = await normalizePositionSideWrite(supabase, body.position, body.side);
      const { data, error } = await supabase.from("vehicle_oe_number").insert({
        vehicle_catalog_id: vid,
        maintenance_component_id: componentId,
        position: normPos.position,
        side: normPos.side,
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

  route.patch(`${ADMIN}/vehicles/:id/oe-numbers/:oeId`, ...guard, async (c: Context) => {
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
      if (body.position != null || body.side != null) {
        const normPos = await normalizePositionSideWrite(supabase, body.position, body.side);
        patch.position = normPos.position;
        patch.side = normPos.side;
      }
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

  route.delete(`${ADMIN}/vehicles/:id/oe-numbers/:oeId`, ...guard, async (c: Context) => {
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

  route.post(`${ADMIN}/oe-numbers/normalize`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { brand?: string; oe_brand?: string; oe_number?: string; number?: string; position?: string; side?: string };
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

  route.get(`${ADMIN}/vehicles/:id/derived-fits`, ...guard, async (c: Context) => {
    const denied = staffOnly(c);
    if (denied) return denied;
    const engineDenied = await requireAutoMatchEngine(c, supabase);
    if (engineDenied) return engineDenied;
    try {
      const vid = assertUuid(c.req.param("id"));
      if (!vid) return c.json({ error: "Invalid vehicle id" }, 400);
      const { data, error } = await supabase.from("part_fit_derived").select("*")
        .eq("vehicle_catalog_id", vid).order("computed_at", { ascending: false }).limit(500);
      if (error) throw error;
      const rows = await enrichDerivedFitRows(supabase, vid, (data ?? []) as Array<Record<string, unknown>>);
      return c.json({ rows });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get(`${ADMIN}/vehicles/:id/revisions`, ...guard, async (c: Context) => {
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
      return c.json({ rows: revisionDiffRows((data ?? []) as Array<Record<string, unknown>>) });
    } catch (e) {
      return fail(c, e);
    }
  });

  const bindPartRefs = (
    segment: "oe-references" | "index-numbers" | "approvals",
    table: "part_oe_reference" | "part_index_number" | "part_approval",
  ) => {
    route.get(`${ADMIN}/parts/:id/${segment}`, ...guard, async (c: Context) => {
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

    route.post(`${ADMIN}/parts/:id/${segment}`, ...guard, async (c: Context) => {
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

    route.patch(`${ADMIN}/parts/:id/${segment}/:refId`, ...guard, async (c: Context) => {
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
          const { data: existing, error: readErr } = await supabase.from(table)
            .select("oe_brand, oe_number")
            .eq("id", refId)
            .eq("part_id", pid)
            .maybeSingle();
          if (readErr) throw readErr;
          const brand = String(body.oe_brand ?? (existing as { oe_brand?: string } | null)?.oe_brand ?? "").trim();
          const number = String(body.oe_number ?? (existing as { oe_number?: string } | null)?.oe_number ?? "").trim();
          if (!brand || !number) return c.json({ error: "Brand and number must stay paired." }, 400);
          Object.assign(patch, await normalizeOeFields(supabase, brand, number));
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

    route.delete(`${ADMIN}/parts/:id/${segment}/:refId`, ...guard, async (c: Context) => {
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
