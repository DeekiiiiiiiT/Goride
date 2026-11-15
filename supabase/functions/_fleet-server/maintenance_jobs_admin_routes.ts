/**
 * Dominion maintenance jobs admin routes (V2–V6) — docs/engine-service-sections-plan.md Layer 2.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPlatformStaffResponse, requireAuth } from "./rbac_middleware.ts";
import { assertCatalogWriteResponse } from "./catalog_access.ts";
import {
  allocateUniqueCode,
  allocateUniqueGlobalCode,
  allocateUniqueOpCode,
  defaultFitModeForJob,
  duplicateMemberMessage,
  fieldSchemaForJob,
  isUuid,
  JOB_ACTIONS,
  relationRefusal,
  renumberSortOrders,
  usedJobPatchRefusal,
  mapCategoryToJob,
  opCodePrefixForSystem,
  parseJobIds,
  actorUserIdFromRbac,
  mapJobItemRowToApi,
  mapServiceItemsDbError,
  mapSupplyRowToApi,
  pgErrorMessage,
  pgUniqueViolation,
  tidySupplyName,
  validateActiveLinkOrder,
  validateJobItemNeed,
  validateJobItemNote,
  validateQtyHint,
  validateSupplyDescription,
  validateSupplyIconKey,
  type JobRow,
  type RelationRow,
} from "./maintenance_jobs_admin_helpers.ts";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

function errMsg(e: unknown): string {
  return pgErrorMessage(e);
}

function serviceItemsHttpError(
  c: Context,
  e: unknown,
  context: "job_item" | "job_relation" | "supply",
) {
  const mapped = mapServiceItemsDbError(pgErrorMessage(e), context, {
    uniqueViolation: pgUniqueViolation(e),
  });
  if (mapped) return c.json({ error: mapped.error }, mapped.status as 400 | 409);
  return null;
}

async function fetchUsedIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("maintenance_job_used_ids");
  if (error) throw error;
  return new Set((data || []).map((id: unknown) => String(id)));
}

async function buildJobsPayload(supabase: SupabaseClient) {
  const [groupsRes, sgRes, secRes, memRes, jobsRes, relRes, usedIds, itemsRes, suppliesRes, unitsRes] = await Promise.all([
    supabase
      .from("maintenance_service_categories")
      .select("id, code, name, icon_key")
      .eq("kind", "system")
      .eq("status", "active")
      .not("code", "like", "imp-%")
      .order("sort_order")
      .order("name"),
    supabase
      .from("maintenance_job_section_groups")
      .select("id, system_id, code, name, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("maintenance_job_sections")
      .select("id, group_id, system_id, code, name, description, icon_key, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("maintenance_job_section_members")
      .select("section_id, category_id, sort_order")
      .order("sort_order"),
    supabase
      .from("maintenance_service_categories")
      .select("*")
      .eq("kind", "component")
      .order("name"),
    supabase
      .from("maintenance_job_relations")
      .select("id, from_category_id, to_category_id, note"),
    fetchUsedIds(supabase),
    supabase
      .from("maintenance_job_item")
      .select("*")
      .is("removed_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.from("maintenance_supply").select("*").order("name"),
    supabase
      .from("maintenance_unit")
      .select("id, code, label_one, label_many, sort_order")
      .eq("status", "active")
      .order("sort_order"),
  ]);

  for (const r of [groupsRes, sgRes, secRes, memRes, jobsRes, relRes, itemsRes, suppliesRes, unitsRes]) {
    if (r.error) throw r.error;
  }

  const jobRows = (jobsRes.data || []) as JobRow[];
  const byId = new Map(jobRows.map((j) => [String(j.id), j]));

  const relations = (relRes.data || []) as RelationRow[];
  const outByFrom = new Map<string, RelationRow[]>();
  const inByTo = new Map<string, RelationRow[]>();
  for (const r of relations) {
    const from = String(r.from_category_id);
    const to = String(r.to_category_id);
    const o = outByFrom.get(from) || [];
    o.push(r);
    outByFrom.set(from, o);
    const inn = inByTo.get(to) || [];
    inn.push(r);
    inByTo.set(to, inn);
  }

  const itemRows = (itemsRes.data || []) as Record<string, unknown>[];
  const supplyRows = (suppliesRes.data || []) as Record<string, unknown>[];
  const unitRows = (unitsRes.data || []) as Record<string, unknown>[];
  const suppliesById = new Map(supplyRows.map((s) => [String(s.id), s]));
  const unitsById = new Map(unitRows.map((u) => [String(u.id), u]));

  const extraCatIds = new Set<string>();
  for (const it of itemRows) {
    const pt = it.part_type_id != null ? String(it.part_type_id) : "";
    if (pt && !byId.has(pt)) extraCatIds.add(pt);
  }
  if (extraCatIds.size > 0) {
    const { data: extraJobs, error: extraErr } = await supabase
      .from("maintenance_service_categories")
      .select("*")
      .in("id", [...extraCatIds]);
    if (extraErr) throw extraErr;
    for (const row of extraJobs || []) {
      byId.set(String((row as JobRow).id), row as JobRow);
    }
  }

  const supplyLinkCounts = new Map<string, number>();
  const itemsByJob = new Map<string, Record<string, unknown>[]>();
  for (const it of itemRows) {
    const jobId = String(it.job_id);
    const list = itemsByJob.get(jobId) || [];
    list.push(it);
    itemsByJob.set(jobId, list);
    if (it.supply_id != null) {
      const sid = String(it.supply_id);
      supplyLinkCounts.set(sid, (supplyLinkCounts.get(sid) ?? 0) + 1);
    }
  }

  const jobs = jobRows.map((row) => {
    const mapped = mapCategoryToJob(row, usedIds, byId, outByFrom, inByTo);
    const jobId = String(row.id);
    const links = (itemsByJob.get(jobId) || []).slice().sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    const items = links.map((link) => {
      if (link.part_type_id != null) {
        const cat = byId.get(String(link.part_type_id));
        const status = cat ? String(cat.status ?? "active") : "retired";
        return mapJobItemRowToApi(link, cat ? String(cat.name) : "Unknown", status !== "active");
      }
      const sup = suppliesById.get(String(link.supply_id));
      const unit = sup ? unitsById.get(String(sup.unit_id)) : undefined;
      const retired = sup ? String(sup.status) !== "active" : true;
      return mapJobItemRowToApi(
        link,
        sup ? String(sup.name) : "Unknown",
        retired,
        unit ? { label_one: String(unit.label_one), label_many: String(unit.label_many) } : undefined,
      );
    });
    return { ...mapped, items };
  });

  const membersBySection = new Map<string, Array<{ category_id: string; sort_order: number | null }>>();
  for (const m of memRes.data || []) {
    const sid = String((m as { section_id: string }).section_id);
    const list = membersBySection.get(sid) || [];
    list.push({
      category_id: String((m as { category_id: string }).category_id),
      sort_order: (m as { sort_order: number | null }).sort_order,
    });
    membersBySection.set(sid, list);
  }

  const sectionsByGroup = new Map<string, Record<string, unknown>[]>();
  for (const s of secRes.data || []) {
    const gid = String((s as { group_id: string }).group_id);
    const list = sectionsByGroup.get(gid) || [];
    const sid = String((s as { id: string }).id);
    const mems = membersBySection.get(sid) || [];
    mems.sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)));
    const jobIds = mems.map((m) => m.category_id);
    list.push({
      id: sid,
      sectionGroupId: gid,
      groupId: String((s as { system_id: string }).system_id),
      code: String((s as { code: string }).code),
      name: String((s as { name: string }).name),
      description: String((s as { description: string }).description),
      iconKey: String((s as { icon_key: string }).icon_key),
      sortOrder: Number((s as { sort_order: number }).sort_order),
      jobIds,
    });
    sectionsByGroup.set(gid, list);
  }

  const sectionGroups = (sgRes.data || []).map((sg) => {
    const id = String((sg as { id: string }).id);
    const sections = (sectionsByGroup.get(id) || []).sort(
      (a, b) => Number(a.sortOrder) - Number(b.sortOrder) || String(a.name).localeCompare(String(b.name)),
    );
    return {
      id,
      groupId: String((sg as { system_id: string }).system_id),
      code: String((sg as { code: string }).code),
      name: String((sg as { name: string }).name),
      sortOrder: Number((sg as { sort_order: number }).sort_order),
      sections,
    };
  });

  const groups = (groupsRes.data || []).map((g) => ({
    id: String((g as { id: string }).id),
    code: String((g as { code: string }).code),
    name: String((g as { name: string }).name),
    iconKey: (g as { icon_key: string | null }).icon_key != null
      ? String((g as { icon_key: string }).icon_key)
      : null,
  }));

  const supplies = supplyRows.map((row) => {
    const unit = unitsById.get(String(row.unit_id));
    return mapSupplyRowToApi(
      row,
      unit ? String(unit.code) : "",
      supplyLinkCounts.get(String(row.id)) ?? 0,
    );
  });

  const units = unitRows.map((u) => ({
    id: String(u.id),
    code: String(u.code),
    labelOne: String(u.label_one),
    labelMany: String(u.label_many),
  }));

  return { groups, sectionGroups, jobs, supplies, units };
}

async function loadJobItem(supabase: SupabaseClient, id: string) {
  const usedIds = await fetchUsedIds(supabase);
  const { data: row, error } = await supabase
    .from("maintenance_service_categories")
    .select("*")
    .eq("id", id)
    .eq("kind", "component")
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: rels, error: rErr } = await supabase
    .from("maintenance_job_relations")
    .select("id, from_category_id, to_category_id, note");
  if (rErr) throw rErr;

  const { data: allJobs } = await supabase
    .from("maintenance_service_categories")
    .select("*")
    .eq("kind", "component");
  const byId = new Map((allJobs || []).map((j) => [String((j as JobRow).id), j as JobRow]));

  const outByFrom = new Map<string, RelationRow[]>();
  const inByTo = new Map<string, RelationRow[]>();
  for (const r of (rels || []) as RelationRow[]) {
    const from = String(r.from_category_id);
    const to = String(r.to_category_id);
    const o = outByFrom.get(from) || [];
    o.push(r);
    outByFrom.set(from, o);
    const inn = inByTo.get(to) || [];
    inn.push(r);
    inByTo.set(to, inn);
  }

  return mapCategoryToJob(row as JobRow, usedIds, byId, outByFrom, inByTo);
}

async function loadSupplyApi(supabase: SupabaseClient, id: string) {
  const { data: row, error } = await supabase.from("maintenance_supply").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { data: unit } = await supabase
    .from("maintenance_unit")
    .select("code")
    .eq("id", String(row.unit_id))
    .maybeSingle();
  const { count } = await supabase
    .from("maintenance_job_item")
    .select("id", { count: "exact", head: true })
    .eq("supply_id", id)
    .is("removed_at", null);
  const names = await staffNamesFor(supabase, [row.created_by, row.updated_by]);
  return mapSupplyRowToApi(row as Record<string, unknown>, unit ? String(unit.code) : "", count ?? 0, names);
}

/** Staff name (profile name, else email) for user ids; unknown ids are left out. */
async function staffNamesFor(supabase: SupabaseClient, ids: unknown[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.map((i) => String(i ?? "").trim()).filter((i) => isUuid(i)))].slice(0, 50);
  for (const id of unique) {
    try {
      const { data } = await supabase.auth.admin.getUserById(id);
      const u = data?.user;
      const meta = (u?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const name = String(meta.full_name || meta.name || u?.email || "").trim();
      if (name) names.set(id, name);
    } catch {
      /* leave unknown */
    }
  }
  return names;
}

async function loadMayNeedLinkApi(supabase: SupabaseClient, linkId: string) {
  const { data: link, error } = await supabase
    .from("maintenance_job_item")
    .select("*")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw error;
  if (!link || link.removed_at != null) return null;
  const row = link as Record<string, unknown>;
  if (row.part_type_id != null) {
    const { data: cat } = await supabase
      .from("maintenance_service_categories")
      .select("name, status")
      .eq("id", String(row.part_type_id))
      .maybeSingle();
    return mapJobItemRowToApi(row, cat ? String(cat.name) : "Unknown", cat ? String(cat.status) !== "active" : true);
  }
  const { data: sup } = await supabase
    .from("maintenance_supply")
    .select("name, status, unit_id")
    .eq("id", String(row.supply_id))
    .maybeSingle();
  let unit: { label_one: string; label_many: string } | undefined;
  if (sup?.unit_id) {
    const { data: u } = await supabase
      .from("maintenance_unit")
      .select("label_one, label_many")
      .eq("id", String(sup.unit_id))
      .maybeSingle();
    if (u) unit = { label_one: String(u.label_one), label_many: String(u.label_many) };
  }
  return mapJobItemRowToApi(
    row,
    sup ? String(sup.name) : "Unknown",
    sup ? String(sup.status) !== "active" : true,
    unit,
  );
}

async function countSupplyHiddenFromJobs(supabase: SupabaseClient, supplyId: string): Promise<number> {
  const { data: links, error } = await supabase
    .from("maintenance_job_item")
    .select("job_id")
    .eq("supply_id", supplyId)
    .is("removed_at", null);
  if (error) throw error;
  const jobIds = [...new Set((links || []).map((l) => String(l.job_id)))];
  if (!jobIds.length) return 0;
  const { data: jobs, error: jErr } = await supabase
    .from("maintenance_service_categories")
    .select("id, status")
    .in("id", jobIds)
    .eq("status", "active");
  if (jErr) throw jErr;
  return (jobs || []).length;
}

async function memberConflictSectionName(
  supabase: SupabaseClient,
  systemId: string,
  categoryId: string,
  sectionId: string,
): Promise<string | null> {
  const { data: mem, error } = await supabase
    .from("maintenance_job_section_members")
    .select("section_id")
    .eq("system_id", systemId)
    .eq("category_id", categoryId)
    .neq("section_id", sectionId)
    .limit(1)
    .maybeSingle();
  if (error || !mem) return null;
  const { data: sec } = await supabase
    .from("maintenance_job_sections")
    .select("name")
    .eq("id", String((mem as { section_id: string }).section_id))
    .maybeSingle();
  return sec?.name ? String(sec.name) : null;
}

export const MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS: Record<string, "catalog.write" | "staff_read"> = {
  "GET /admin/maintenance/jobs": "staff_read",
  "POST /admin/maintenance/jobs": "catalog.write",
  "PATCH /admin/maintenance/jobs/:id": "catalog.write",
  "POST /admin/maintenance/jobs/:id/retire": "catalog.write",
  "POST /admin/maintenance/jobs/:id/restore": "catalog.write",
  "POST /admin/maintenance/section-groups": "catalog.write",
  "PATCH /admin/maintenance/section-groups/:id": "catalog.write",
  "DELETE /admin/maintenance/section-groups/:id": "catalog.write",
  "PUT /admin/maintenance/section-groups/order": "catalog.write",
  "POST /admin/maintenance/sections": "catalog.write",
  "PATCH /admin/maintenance/sections/:id": "catalog.write",
  "DELETE /admin/maintenance/sections/:id": "catalog.write",
  "PUT /admin/maintenance/sections/order": "catalog.write",
  "PUT /admin/maintenance/sections/:id/members": "catalog.write",
  "GET /admin/maintenance/supplies": "staff_read",
  "POST /admin/maintenance/supplies": "catalog.write",
  "PATCH /admin/maintenance/supplies/:id": "catalog.write",
  "POST /admin/maintenance/supplies/:id/retire": "catalog.write",
  "POST /admin/maintenance/supplies/:id/restore": "catalog.write",
  "POST /admin/maintenance/job-items": "catalog.write",
  "PATCH /admin/maintenance/job-items/:id": "catalog.write",
  "POST /admin/maintenance/job-items/:id/remove": "catalog.write",
  "PUT /admin/maintenance/jobs/:id/items/order": "catalog.write",
  "POST /admin/maintenance/job-relations": "catalog.write",
  "DELETE /admin/maintenance/job-relations/:id": "catalog.write",
};

export function registerMaintenanceJobsAdminRoutes(route: RouteApp, supabase: SupabaseClient): void {
  route.get("/admin/maintenance/jobs", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      return c.json(await buildJobsPayload(supabase));
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/jobs", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      const homeGroupId = String(body.homeGroupId ?? "").trim();
      const isPart = body.isPart === true;
      const defaultAction = String(body.defaultAction ?? (isPart ? "replace" : "other")).trim();
      const description = String(body.description ?? "").trim();
      const iconKey = String(body.iconKey ?? (isPart ? "gears" : "wrench")).trim();
      if (!name) return c.json({ error: "Name is required." }, 400);
      if (!isUuid(homeGroupId)) return c.json({ error: "Home group is required." }, 400);
      if (!description) return c.json({ error: "Description is required." }, 400);
      if (!JOB_ACTIONS.has(defaultAction)) return c.json({ error: "Default action is not valid." }, 400);

      const { data: parent, error: pErr } = await supabase
        .from("maintenance_service_categories")
        .select("id, code, kind")
        .eq("id", homeGroupId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parent || String(parent.kind) !== "system") {
        return c.json({ error: "Home group was not found." }, 400);
      }

      const { data: dup } = await supabase
        .from("maintenance_service_categories")
        .select("id")
        .eq("parent_id", homeGroupId)
        .eq("name", name)
        .maybeSingle();
      if (dup) return c.json({ error: "A job with this name already exists in this group." }, 409);

      const code = await allocateUniqueCode(supabase, name);
      const op_code = await allocateUniqueOpCode(
        supabase,
        opCodePrefixForSystem(String(parent.code ?? "sys_engine")),
        name,
      );

      const row = {
        code,
        name: name.slice(0, 200),
        plain_name: name.slice(0, 200),
        description: description.slice(0, 2000),
        icon_key: iconKey.slice(0, 40),
        field_schema: fieldSchemaForJob(isPart),
        quick_job_eligible: true,
        sort_order: 0,
        parent_id: homeGroupId,
        kind: "component",
        op_code,
        position_aware: false,
        is_part: isPart,
        default_fit_mode: defaultFitModeForJob(isPart, String(parent.code ?? "")),
        part_type_status: "active",
        position_scheme: "none",
        status: "active",
        default_action: defaultAction,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("maintenance_service_categories")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      const item = await loadJobItem(supabase, String(data.id));
      return c.json({ item });
    } catch (e: unknown) {
      if (pgUniqueViolation(e)) {
        return c.json({ error: "A job with this name or code already exists." }, 409);
      }
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/jobs/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid job id." }, 400);
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const usedIds = await fetchUsedIds(supabase);
      const used = usedIds.has(id);
      const patchRefusal = usedJobPatchRefusal(body, used);
      if (patchRefusal) return c.json({ error: patchRefusal }, 409);

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return c.json({ error: "Name is required." }, 400);
        patch.name = name.slice(0, 200);
        patch.plain_name = patch.name;
      }
      if (body.description !== undefined) {
        const description = String(body.description).trim();
        if (!description) return c.json({ error: "Description is required." }, 400);
        patch.description = description.slice(0, 2000);
      }
      if (body.defaultAction !== undefined) {
        const a = String(body.defaultAction).trim();
        if (!JOB_ACTIONS.has(a)) return c.json({ error: "Default action is not valid." }, 400);
        patch.default_action = a;
      }
      if (body.iconKey !== undefined) patch.icon_key = String(body.iconKey).trim().slice(0, 40);
      if (!used && body.homeGroupId !== undefined) {
        const homeGroupId = String(body.homeGroupId).trim();
        if (!isUuid(homeGroupId)) return c.json({ error: "Home group is not valid." }, 400);
        patch.parent_id = homeGroupId;
      }
      if (!used && body.isPart !== undefined) {
        const isPart = body.isPart === true;
        patch.is_part = isPart;
        patch.field_schema = fieldSchemaForJob(isPart);
        const { data: cur } = await supabase
          .from("maintenance_service_categories")
          .select("parent_id")
          .eq("id", id)
          .maybeSingle();
        let systemCode = "sys_engine";
        if (cur?.parent_id) {
          const { data: sys } = await supabase
            .from("maintenance_service_categories")
            .select("code")
            .eq("id", String(cur.parent_id))
            .maybeSingle();
          if (sys?.code) systemCode = String(sys.code);
        }
        patch.default_fit_mode = defaultFitModeForJob(isPart, systemCode);
      }

      const { error } = await supabase.from("maintenance_service_categories").update(patch).eq("id", id);
      if (error) throw error;
      const item = await loadJobItem(supabase, id);
      if (!item) return c.json({ error: "Job was not found." }, 404);
      return c.json({ item });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/jobs/:id/retire", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid job id." }, 400);
    try {
      const { data, error } = await supabase.rpc("maintenance_job_retire_cascade", { p_category_id: id });
      if (error) {
        if (String(error.message).includes("Job not found")) {
          return c.json({ error: "Job was not found." }, 404);
        }
        throw error;
      }
      const { count: hiddenFromMayNeed } = await supabase
        .from("maintenance_job_item")
        .select("id", { count: "exact", head: true })
        .is("removed_at", null)
        .or(`job_id.eq.${id},part_type_id.eq.${id}`);
      const payload = (data ?? {}) as Record<string, unknown>;
      return c.json({
        removedFromSections: Number(payload.removedFromSections ?? 0),
        removedLinks: Number(payload.removedLinks ?? 0),
        hiddenFromMayNeed: hiddenFromMayNeed ?? 0,
      });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/jobs/:id/restore", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid job id." }, 400);
    try {
      const { error } = await supabase
        .from("maintenance_service_categories")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      const item = await loadJobItem(supabase, id);
      if (!item) return c.json({ error: "Job was not found." }, 404);
      return c.json({ item });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/section-groups", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const groupId = String(body.groupId ?? "").trim();
      const name = String(body.name ?? "").trim();
      if (!isUuid(groupId)) return c.json({ error: "Group is required." }, 400);
      if (!name) return c.json({ error: "Name is required." }, 400);

      const { data: maxRow } = await supabase
        .from("maintenance_job_section_groups")
        .select("sort_order")
        .eq("system_id", groupId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = maxRow?.sort_order != null ? Number(maxRow.sort_order) + 10 : 10;
      const code = await allocateUniqueGlobalCode(supabase, name, "maintenance_job_section_groups");

      const { data, error } = await supabase
        .from("maintenance_job_section_groups")
        .insert({
          system_id: groupId,
          code,
          name: name.slice(0, 200),
          sort_order,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return c.json(mapSectionGroupRow(data));
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/section-groups/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const name = body.name !== undefined ? String(body.name).trim() : null;
      if (name !== null && !name) return c.json({ error: "Name is required." }, 400);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== null) patch.name = name.slice(0, 200);
      const { data, error } = await supabase
        .from("maintenance_job_section_groups")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "Section group was not found." }, 404);
      return c.json(mapSectionGroupRow(data));
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.delete("/admin/maintenance/section-groups/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const { count } = await supabase
        .from("maintenance_job_sections")
        .select("*", { count: "exact", head: true })
        .eq("group_id", id);
      if ((count ?? 0) > 0) {
        return c.json({ error: "Remove every section in this group before you delete it." }, 409);
      }
      const { error } = await supabase.from("maintenance_job_section_groups").delete().eq("id", id);
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.put("/admin/maintenance/section-groups/order", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const groupId = String(body.groupId ?? "").trim();
      const orderedIds = parseJobIds(body.orderedIds);
      if (!isUuid(groupId)) return c.json({ error: "Group is required." }, 400);
      if (!orderedIds) return c.json({ error: "Ordered ids are required." }, 400);
      const { error } = await supabase.rpc("maintenance_mjsg_reorder", {
        p_system_id: groupId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/sections", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const sectionGroupId = String(body.sectionGroupId ?? "").trim();
      const name = String(body.name ?? "").trim();
      const description = String(body.description ?? "").trim();
      const iconKey = String(body.iconKey ?? "wrench").trim();
      if (!isUuid(sectionGroupId)) return c.json({ error: "Section group is required." }, 400);
      if (!name) return c.json({ error: "Name is required." }, 400);
      if (!description) return c.json({ error: "Description is required." }, 400);

      const { data: sg, error: sgErr } = await supabase
        .from("maintenance_job_section_groups")
        .select("id, system_id")
        .eq("id", sectionGroupId)
        .maybeSingle();
      if (sgErr) throw sgErr;
      if (!sg) return c.json({ error: "Section group was not found." }, 404);

      const { data: maxRow } = await supabase
        .from("maintenance_job_sections")
        .select("sort_order")
        .eq("group_id", sectionGroupId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = maxRow?.sort_order != null ? Number(maxRow.sort_order) + 10 : 10;
      const code = await allocateUniqueGlobalCode(supabase, name, "maintenance_job_sections");

      const { data, error } = await supabase
        .from("maintenance_job_sections")
        .insert({
          group_id: sectionGroupId,
          system_id: String(sg.system_id),
          code,
          name: name.slice(0, 200),
          description: description.slice(0, 2000),
          icon_key: iconKey.slice(0, 40),
          sort_order,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return c.json(mapSectionRow(data));
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/sections/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return c.json({ error: "Name is required." }, 400);
        patch.name = name.slice(0, 200);
      }
      if (body.description !== undefined) {
        const description = String(body.description).trim();
        if (!description) return c.json({ error: "Description is required." }, 400);
        patch.description = description.slice(0, 2000);
      }
      if (body.iconKey !== undefined) patch.icon_key = String(body.iconKey).trim().slice(0, 40);

      const { data, error } = await supabase
        .from("maintenance_job_sections")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "Section was not found." }, 404);
      return c.json(mapSectionRow(data));
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.delete("/admin/maintenance/sections/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const { count } = await supabase
        .from("maintenance_job_section_members")
        .select("*", { count: "exact", head: true })
        .eq("section_id", id);
      if ((count ?? 0) > 0) {
        return c.json({ error: "Remove every job from this section before you delete it." }, 409);
      }
      const { error } = await supabase.from("maintenance_job_sections").delete().eq("id", id);
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.put("/admin/maintenance/sections/order", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const sectionGroupId = String(body.sectionGroupId ?? "").trim();
      const orderedIds = parseJobIds(body.orderedIds);
      if (!isUuid(sectionGroupId)) return c.json({ error: "Section group is required." }, 400);
      if (!orderedIds) return c.json({ error: "Ordered ids are required." }, 400);
      const { error } = await supabase.rpc("maintenance_mjs_reorder", {
        p_group_id: sectionGroupId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.put("/admin/maintenance/sections/:id/members", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const sectionId = c.req.param("id");
    if (!isUuid(sectionId)) return c.json({ error: "Invalid section id." }, 400);
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const jobIds = parseJobIds(body.jobIds) ?? [];

      const { data: sec, error: sErr } = await supabase
        .from("maintenance_job_sections")
        .select("id, system_id")
        .eq("id", sectionId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sec) return c.json({ error: "Section was not found." }, 404);
      const systemId = String(sec.system_id);

      if (jobIds.length) {
        const { data: jobRows, error: jErr } = await supabase
          .from("maintenance_service_categories")
          .select("id, name, kind, status")
          .in("id", jobIds);
        if (jErr) throw jErr;
        const found = new Map((jobRows || []).map((j) => [String(j.id), j]));
        for (const jobId of jobIds) {
          const j = found.get(jobId);
          if (!j || String(j.kind) !== "component") {
            return c.json({ error: "One of those jobs was not found." }, 400);
          }
          if (String(j.status) !== "active") {
            return c.json({ error: `${String(j.name)} is retired — restore it before adding it to a section.` }, 409);
          }
        }
      }

      for (const jobId of jobIds) {
        const other = await memberConflictSectionName(supabase, systemId, jobId, sectionId);
        if (other) return c.json({ error: duplicateMemberMessage(other) }, 409);
      }

      const { error } = await supabase.rpc("maintenance_job_section_members_set", {
        p_section_id: sectionId,
        p_job_ids: jobIds,
      });
      if (error) {
        if (pgUniqueViolation(error)) {
          const conflictJob = jobIds.find(Boolean);
          if (conflictJob) {
            const other = await memberConflictSectionName(supabase, systemId, conflictJob, sectionId);
            if (other) return c.json({ error: duplicateMemberMessage(other) }, 409);
          }
          return c.json({ error: "That job is already in another section of this group." }, 409);
        }
        throw error;
      }
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.get("/admin/maintenance/supplies", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const status = String(c.req.query("status") ?? "active").trim();
      if (status !== "active" && status !== "retired") {
        return c.json({ error: "Status must be active or retired." }, 400);
      }
      const { data: supplyRows, error } = await supabase
        .from("maintenance_supply")
        .select("*")
        .eq("status", status)
        .order("name");
      if (error) throw error;
      const { data: units } = await supabase.from("maintenance_unit").select("id, code");
      const unitsById = new Map((units || []).map((u) => [String(u.id), String(u.code)]));
      const supplyIds = (supplyRows || []).map((r) => String(r.id));
      const usedCount = new Map<string, number>();
      if (supplyIds.length) {
        const { data: links, error: linkErr } = await supabase
          .from("maintenance_job_item")
          .select("supply_id")
          .in("supply_id", supplyIds)
          .is("removed_at", null);
        if (linkErr) throw linkErr;
        for (const l of links || []) {
          const sid = String((l as { supply_id: string }).supply_id);
          usedCount.set(sid, (usedCount.get(sid) ?? 0) + 1);
        }
      }
      const names = await staffNamesFor(
        supabase,
        (supplyRows || []).flatMap((r) => [r.created_by, r.updated_by]),
      );
      const items = (supplyRows || []).map((row) =>
        mapSupplyRowToApi(
          row as Record<string, unknown>,
          unitsById.get(String(row.unit_id)) ?? "",
          usedCount.get(String(row.id)) ?? 0,
          names,
        )
      );
      return c.json({ items });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/supplies", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const nameOk = tidySupplyName(body.name);
      if (!nameOk.ok) return c.json({ error: nameOk.error }, 400);
      const descOk = validateSupplyDescription(body.description);
      if (!descOk.ok) return c.json({ error: descOk.error }, 400);
      const iconOk = validateSupplyIconKey(body.iconKey ?? "wrench");
      if (!iconOk.ok) return c.json({ error: iconOk.error }, 400);
      const unitId = String(body.unitId ?? "").trim();
      if (!isUuid(unitId)) return c.json({ error: "Choose a unit." }, 400);
      const { data: unit } = await supabase
        .from("maintenance_unit")
        .select("id")
        .eq("id", unitId)
        .eq("status", "active")
        .maybeSingle();
      if (!unit) return c.json({ error: "Choose a unit." }, 400);
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      const { data, error } = await supabase
        .from("maintenance_supply")
        .insert({
          name: nameOk.name,
          description: descOk.description,
          icon_key: iconOk.iconKey,
          unit_id: unitId,
          created_by: actor,
          updated_by: actor,
        })
        .select("id")
        .single();
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "supply");
        if (mapped) return mapped;
        throw error;
      }
      const item = await loadSupplyApi(supabase, String(data.id));
      return c.json({ item });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "supply");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/supplies/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid supply id." }, 400);
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const nameOk = tidySupplyName(body.name);
        if (!nameOk.ok) return c.json({ error: nameOk.error }, 400);
        patch.name = nameOk.name;
      }
      if (body.description !== undefined) {
        const descOk = validateSupplyDescription(body.description);
        if (!descOk.ok) return c.json({ error: descOk.error }, 400);
        patch.description = descOk.description;
      }
      if (body.iconKey !== undefined) {
        const iconOk = validateSupplyIconKey(body.iconKey);
        if (!iconOk.ok) return c.json({ error: iconOk.error }, 400);
        patch.icon_key = iconOk.iconKey;
      }
      if (body.unitId !== undefined) {
        const unitId = String(body.unitId ?? "").trim();
        if (!isUuid(unitId)) return c.json({ error: "Choose a unit." }, 400);
        const { data: unit } = await supabase
          .from("maintenance_unit")
          .select("id")
          .eq("id", unitId)
          .eq("status", "active")
          .maybeSingle();
        if (!unit) return c.json({ error: "Choose a unit." }, 400);
        patch.unit_id = unitId;
      }
      if (!Object.keys(patch).length) return c.json({ error: "Nothing to update." }, 400);
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      patch.updated_by = actor;
      const { error } = await supabase.from("maintenance_supply").update(patch).eq("id", id);
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "supply");
        if (mapped) return mapped;
        throw error;
      }
      const item = await loadSupplyApi(supabase, id);
      if (!item) return c.json({ error: "Supply was not found." }, 404);
      return c.json({ item });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "supply");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/supplies/:id/retire", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid supply id." }, 400);
    try {
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      const { error } = await supabase
        .from("maintenance_supply")
        .update({ status: "retired", updated_by: actor })
        .eq("id", id)
        .eq("status", "active");
      if (error) throw error;
      const item = await loadSupplyApi(supabase, id);
      if (!item) return c.json({ error: "Supply was not found." }, 404);
      const hiddenFromJobs = await countSupplyHiddenFromJobs(supabase, id);
      return c.json({ item, hiddenFromJobs });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/supplies/:id/restore", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid supply id." }, 400);
    try {
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      const { error } = await supabase
        .from("maintenance_supply")
        .update({ status: "active", updated_by: actor })
        .eq("id", id)
        .eq("status", "retired");
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "supply");
        if (mapped) return mapped;
        throw error;
      }
      const item = await loadSupplyApi(supabase, id);
      if (!item) return c.json({ error: "Supply was not found." }, 404);
      return c.json({ item });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "supply");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/job-items", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const jobId = String(body.jobId ?? "").trim();
      const kind = String(body.kind ?? "").trim();
      const itemId = String(body.itemId ?? "").trim();
      if (!isUuid(jobId) || !isUuid(itemId)) return c.json({ error: "Job and item are required." }, 400);
      if (kind !== "part_type" && kind !== "supply") return c.json({ error: "Item kind must be part_type or supply." }, 400);
      const needOk = validateJobItemNeed(body.need);
      if (!needOk.ok) return c.json({ error: needOk.error }, 400);
      const qtyOk = validateQtyHint(body.qtyHint);
      if (!qtyOk.ok) return c.json({ error: qtyOk.error }, 400);
      const noteOk = validateJobItemNote(body.note);
      if (!noteOk.ok) return c.json({ error: noteOk.error }, 400);
      const note = noteOk.note;

      const { data: job } = await supabase
        .from("maintenance_service_categories")
        .select("id, status, kind")
        .eq("id", jobId)
        .maybeSingle();
      if (!job || String(job.kind) !== "component") return c.json({ error: "Job was not found." }, 404);
      if (String(job.status) !== "active") return c.json({ error: "Retired jobs can't be changed." }, 409);

      if (kind === "part_type") {
        const { data: pt } = await supabase
          .from("maintenance_service_categories")
          .select("id, status, is_part")
          .eq("id", itemId)
          .maybeSingle();
        if (!pt || !pt.is_part) return c.json({ error: "Part type was not found." }, 404);
        if (String(pt.status) !== "active") return c.json({ error: "Retired items can't be added." }, 409);
      } else {
        const { data: sup } = await supabase.from("maintenance_supply").select("id, status").eq("id", itemId).maybeSingle();
        if (!sup) return c.json({ error: "Supply was not found." }, 404);
        if (String(sup.status) !== "active") return c.json({ error: "Retired items can't be added." }, 409);
      }

      const { data: maxRow } = await supabase
        .from("maintenance_job_item")
        .select("sort_order")
        .eq("job_id", jobId)
        .is("removed_at", null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortOrder = Number(maxRow?.sort_order ?? 0) + 10;
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      const insertRow: Record<string, unknown> = {
        job_id: jobId,
        need: needOk.need,
        qty_hint: qtyOk.qtyHint,
        note: note || null,
        sort_order: sortOrder,
        created_by: actor,
        updated_by: actor,
      };
      if (kind === "part_type") insertRow.part_type_id = itemId;
      else insertRow.supply_id = itemId;

      const { data, error } = await supabase.from("maintenance_job_item").insert(insertRow).select("id").single();
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "job_item");
        if (mapped) return mapped;
        throw error;
      }
      const item = await loadMayNeedLinkApi(supabase, String(data.id));
      return c.json({ item });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "job_item");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/job-items/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid link id." }, 400);
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const keys = Object.keys(body);
      const allowed = new Set(["need", "qtyHint", "note"]);
      if (keys.some((k) => !allowed.has(k))) {
        return c.json({ error: "To change the item, remove it and add the new one." }, 400);
      }
      const { data: existing } = await supabase.from("maintenance_job_item").select("id").eq("id", id).is("removed_at", null).maybeSingle();
      if (!existing) return c.json({ error: "Link was not found." }, 404);
      const patch: Record<string, unknown> = {};
      if (body.need !== undefined) {
        const needOk = validateJobItemNeed(body.need);
        if (!needOk.ok) return c.json({ error: needOk.error }, 400);
        patch.need = needOk.need;
      }
      if (body.qtyHint !== undefined) {
        const qtyOk = validateQtyHint(body.qtyHint);
        if (!qtyOk.ok) return c.json({ error: qtyOk.error }, 400);
        patch.qty_hint = qtyOk.qtyHint;
      }
      if (body.note !== undefined) {
        const noteOk = validateJobItemNote(body.note);
        if (!noteOk.ok) return c.json({ error: noteOk.error }, 400);
        patch.note = noteOk.note;
      }
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      patch.updated_by = actor;
      const { error } = await supabase.from("maintenance_job_item").update(patch).eq("id", id);
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "job_item");
        if (mapped) return mapped;
        throw error;
      }
      const item = await loadMayNeedLinkApi(supabase, id);
      return c.json({ item });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "job_item");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/job-items/:id/remove", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid link id." }, 400);
    try {
      const actor = actorUserIdFromRbac(c.get("rbacUser") as { userId?: string; id?: string } | undefined);
      const { data: existing } = await supabase.from("maintenance_job_item").select("removed_at").eq("id", id).maybeSingle();
      if (!existing) return c.json({ error: "Link was not found." }, 404);
      if (existing.removed_at != null) return c.json({ success: true });
      const { error } = await supabase
        .from("maintenance_job_item")
        .update({ removed_at: new Date().toISOString(), removed_by: actor })
        .eq("id", id);
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.put("/admin/maintenance/jobs/:id/items/order", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const jobId = c.req.param("id");
    if (!isUuid(jobId)) return c.json({ error: "Invalid job id." }, 400);
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const orderedIds = parseJobIds(body.orderedIds) ?? [];
      const { data: links, error } = await supabase
        .from("maintenance_job_item")
        .select("id")
        .eq("job_id", jobId)
        .is("removed_at", null);
      if (error) throw error;
      const activeIds = (links || []).map((l) => String(l.id));
      const orderErr = validateActiveLinkOrder(orderedIds, activeIds);
      if (orderErr) return c.json({ error: orderErr }, 400);
      const sorts = renumberSortOrders(orderedIds);
      for (let i = 0; i < orderedIds.length; i++) {
        const { error: uErr } = await supabase
          .from("maintenance_job_item")
          .update({ sort_order: sorts[i] })
          .eq("id", orderedIds[i]);
        if (uErr) throw uErr;
      }
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.post("/admin/maintenance/job-relations", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const fromJobId = String(body.fromJobId ?? "").trim();
      const toJobId = String(body.toJobId ?? "").trim();
      const note = String(body.note ?? "").trim();
      if (!isUuid(fromJobId) || !isUuid(toJobId)) {
        return c.json({ error: "Both jobs are required." }, 400);
      }
      if (!note) return c.json({ error: "Add a short note saying why they go together." }, 400);
      const selfMsg = relationRefusal(fromJobId, toJobId, false, false);
      if (selfMsg) return c.json({ error: selfMsg }, 409);

      const { data: jobs, error: jErr } = await supabase
        .from("maintenance_service_categories")
        .select("id, status, kind")
        .in("id", [fromJobId, toJobId]);
      if (jErr) throw jErr;
      if ((jobs || []).length !== 2) return c.json({ error: "One of the jobs was not found." }, 400);
      let inactive = false;
      for (const j of jobs || []) {
        if (String(j.kind) !== "component" || String(j.status) !== "active") inactive = true;
      }
      const { data: existing } = await supabase
        .from("maintenance_job_relations")
        .select("id")
        .eq("from_category_id", fromJobId)
        .eq("to_category_id", toJobId)
        .eq("relation_type", "recommended_with")
        .maybeSingle();
      const relMsg = relationRefusal(fromJobId, toJobId, Boolean(existing), inactive);
      if (relMsg) return c.json({ error: relMsg }, 409);

      const { data, error } = await supabase
        .from("maintenance_job_relations")
        .insert({
          from_category_id: fromJobId,
          to_category_id: toJobId,
          relation_type: "recommended_with",
          note: note.slice(0, 500),
        })
        .select("*")
        .single();
      if (error) {
        const mapped = serviceItemsHttpError(c, error, "job_relation");
        if (mapped) return mapped;
        throw error;
      }
      return c.json({
        id: String(data.id),
        fromJobId,
        toJobId,
        note: String(data.note),
      });
    } catch (e: unknown) {
      const mapped = serviceItemsHttpError(c, e, "job_relation");
      if (mapped) return mapped;
      return c.json({ error: errMsg(e) }, 500);
    }
  });

  route.delete("/admin/maintenance/job-relations/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const { error } = await supabase.from("maintenance_job_relations").delete().eq("id", id);
      if (error) throw error;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: errMsg(e) }, 500);
    }
  });
}

function mapSectionGroupRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    groupId: String(row.system_id),
    code: String(row.code),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
  };
}

function mapSectionRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sectionGroupId: String(row.group_id),
    groupId: String(row.system_id),
    code: String(row.code),
    name: String(row.name),
    description: String(row.description),
    iconKey: String(row.icon_key),
    sortOrder: Number(row.sort_order),
  };
}
