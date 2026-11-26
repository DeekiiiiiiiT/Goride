/**
 * Part pictures — the reads and writes the Dominion routes use (docs/part-pictures-audit.md §3.5).
 *
 * Every read names its columns (§2 D7): `part_picture*` is server-only, and a `select("*")` would silently start
 * returning the prompt and the cost rows. The worker keeps its own module (`part_picture_db.ts`); this one never
 * claims and never draws.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** The picture columns S3 and S1 show. Never the prompt, the lease or the staff id that hid it. */
export const PART_PICTURE_ADMIN_COLUMNS =
  "id, interchange_group_id, manufacturer, part_number, part_name, catalog_group_id, status, r2_key, version, template_version, made_at, created_at";

export const PART_PICTURE_TEMPLATE_COLUMNS =
  "catalog_group_id, materials, enabled, version, updated_by, updated_at";

export type AdminPictureRow = {
  id: string;
  interchange_group_id: string;
  manufacturer: string;
  part_number: string;
  part_name: string;
  catalog_group_id: string | null;
  status: string;
  r2_key: string | null;
  version: number;
  template_version: number | null;
  made_at: string | null;
  created_at: string;
};

export type AdminTemplateRow = {
  catalog_group_id: string;
  materials: string;
  enabled: boolean;
  version: number;
  updated_by: string | null;
  updated_at: string;
};

/** A page boundary: the `created_at` and `id` of a row already shown. */
export type PictureCursor = { createdAt: string; id: string };

export type AdminPictureQuery = {
  catalogGroupId: string | null;
  /** Database statuses the filter means. `null` = every state; `[]` = nothing can match. */
  statusIn: string[] | null;
  savedPageId: string | null;
  search: string | null;
  page: number;
  pageSize: number;
  after: PictureCursor | null;
  before: PictureCursor | null;
};

export type AdminPicturePage = {
  rows: AdminPictureRow[];
  /** Rows matching the filters, before paging. */
  total: number;
  hasOlder: boolean;
};

export type AdminPictureStateCounts = { ready: number; failed: number; hidden: number; inProgress: number };

type PgResult = { data: unknown[] | null; error: { message?: string } | null; count?: number | null };
type WriteResult = { error: { message?: string } | null; data?: unknown };

type PgQuery = PromiseLike<PgResult> & {
  eq(column: string, value: unknown): PgQuery;
  in(column: string, values: unknown[]): PgQuery;
  lt(column: string, value: unknown): PgQuery;
  lte(column: string, value: unknown): PgQuery;
  gte(column: string, value: unknown): PgQuery;
  or(filter: string): PgQuery;
  order(column: string, opts?: { ascending?: boolean }): PgQuery;
  limit(count: number): PgQuery;
  maybeSingle(): Promise<PgResult>;
  single(): Promise<PgResult>;
};

/** `update(…).eq(…)`, optionally `.select(…).single()`. */
type PgWrite = PromiseLike<WriteResult> & {
  eq(column: string, value: unknown): PgWrite;
  select(columns: string): PgWrite;
  single(): Promise<WriteResult>;
};

/** One part picture's state, for the routes and the saved-page result. */
export type PartPictureAdminDb = {
  listPictures(query: AdminPictureQuery): Promise<AdminPicturePage>;
  countStates(): Promise<AdminPictureStateCounts>;
  countMadeOn(day: string): Promise<number>;
  /** Part-picture cost booked since an ISO instant (this month's spend, §4 S3). */
  sumCostSince(sinceIso: string): Promise<number>;
  getPicture(id: string): Promise<AdminPictureRow | null>;
  /** Picture ids (out of the given ones) that still have a diagram that was not deleted. */
  liveDiagramPictureIds(pictureIds: string[]): Promise<string[]>;
  remake(id: string, nextVersion: number, nowIso: string): Promise<void>;
  hide(id: string, actorId: string | null, nowIso: string): Promise<void>;
  show(id: string): Promise<void>;
  loadTemplates(): Promise<AdminTemplateRow[]>;
  getTemplate(catalogGroupId: string): Promise<AdminTemplateRow | null>;
  saveTemplate(
    catalogGroupId: string,
    patch: { materials?: string; enabled?: boolean },
    actorId: string | null,
    nextVersion: number,
  ): Promise<AdminTemplateRow | null>;
  /** Ready pictures of one group made with an older template than `templateVersion`. */
  outdatedPictures(catalogGroupId: string, templateVersion: number): Promise<AdminPictureRow[]>;
  queueForRemake(ids: string[], nowIso: string): Promise<number>;
  /** The interchange group behind each part number (normalised), for the saved-page result. */
  interchangeGroupsForNumbers(norms: string[]): Promise<Map<string, string>>;
  picturesByGroupIds(groupIds: string[]): Promise<AdminPictureRow[]>;
  groupNames(ids: string[]): Promise<Map<string, string>>;
};

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Over-fetch so a page boundary inside one `created_at` tick can be trimmed without losing a row. */
const TIE_SLACK = 50;

function mapPicture(data: Record<string, unknown>): AdminPictureRow {
  return {
    id: String(data.id),
    interchange_group_id: String(data.interchange_group_id ?? ""),
    manufacturer: String(data.manufacturer ?? ""),
    part_number: String(data.part_number ?? ""),
    part_name: String(data.part_name ?? ""),
    catalog_group_id: data.catalog_group_id != null ? String(data.catalog_group_id) : null,
    status: String(data.status ?? "queued"),
    r2_key: data.r2_key != null ? String(data.r2_key) : null,
    version: Number(data.version ?? 1),
    template_version: data.template_version != null ? Number(data.template_version) : null,
    made_at: data.made_at != null ? String(data.made_at) : null,
    created_at: String(data.created_at ?? ""),
  };
}

function mapTemplate(data: Record<string, unknown>): AdminTemplateRow {
  return {
    catalog_group_id: String(data.catalog_group_id),
    materials: String(data.materials ?? ""),
    enabled: data.enabled === true,
    version: Number(data.version ?? 1),
    updated_by: data.updated_by != null ? String(data.updated_by) : null,
    updated_at: String(data.updated_at ?? ""),
  };
}

function rows(result: PgResult): Array<Record<string, unknown>> {
  return (result.data ?? []) as Array<Record<string, unknown>>;
}

function errorText(result: PgResult | WriteResult, fallback: string): string {
  return result.error?.message ?? fallback;
}

/** `%` and `_` in a search must match themselves, not act as wildcards. */
function likeEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clampPageSize(size: number): number {
  return Math.max(1, Math.min(Math.floor(size) || 24, 60));
}

export function createPartPictureAdminDb(supabase: SupabaseClient): PartPictureAdminDb {
  /** The filters shared by the page read and the count. */
  const applyFilters = (start: PgQuery, query: AdminPictureQuery): PgQuery => {
    let q = start;
    if (query.catalogGroupId) q = q.eq("catalog_group_id", query.catalogGroupId);
    if (query.savedPageId) q = q.eq("source_saved_page_id", query.savedPageId);
    if (query.statusIn) q = q.in("status", query.statusIn);
    const search = query.search?.trim();
    if (search) {
      const esc = likeEscape(search);
      q = q.or(`part_number.ilike.%${esc}%,part_name.ilike.%${esc}%`);
    }
    return q;
  };

  const db: PartPictureAdminDb = {
    async listPictures(query) {
      // A filter nothing can satisfy (`waiting` with nothing blocking) never reaches the database.
      if (query.statusIn && query.statusIn.length === 0) return { rows: [], total: 0, hasOlder: false };

      const counted = await applyFilters(
        supabase.from("part_picture").select("id", { count: "exact", head: true }) as unknown as PgQuery,
        query,
      ).limit(1);
      if (counted.error) throw new Error(errorText(counted, "Could not count part pictures"));
      const total = Number(counted.count ?? 0);

      const pageSize = clampPageSize(query.pageSize);
      const first = () =>
        applyFilters(
          supabase.from("part_picture").select(PART_PICTURE_ADMIN_COLUMNS) as unknown as PgQuery,
          query,
        );

      if (query.before) {
        // The page just before the one the boundary row is on: the newest pageSize rows newer than it.
        const result = await first()
          .gte("created_at", query.before.createdAt)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(pageSize + TIE_SLACK);
        if (result.error) throw new Error(errorText(result, "Could not load part pictures"));
        const trimmed = rows(result)
          .map(mapPicture)
          .filter((row) => row.created_at !== query.before!.createdAt || row.id > query.before!.id);
        return { rows: trimmed.slice(-pageSize).reverse(), total, hasOlder: true };
      }

      if (query.after) {
        const result = await first()
          .lte("created_at", query.after.createdAt)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(pageSize + TIE_SLACK);
        if (result.error) throw new Error(errorText(result, "Could not load part pictures"));
        const trimmed = rows(result)
          .map(mapPicture)
          .filter((row) => row.created_at !== query.after!.createdAt || row.id < query.after!.id);
        return { rows: trimmed.slice(0, pageSize), total, hasOlder: trimmed.length > pageSize };
      }

      const offset = (Math.max(1, query.page) - 1) * pageSize;
      const result = await first()
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(offset + pageSize + TIE_SLACK);
      if (result.error) throw new Error(errorText(result, "Could not load part pictures"));
      const page = rows(result).map(mapPicture).slice(offset, offset + pageSize);
      return { rows: page, total, hasOlder: offset + page.length < total };
    },

    async countStates() {
      const count = async (statuses: string[]): Promise<number> => {
        const result = await (supabase.from("part_picture")
          .select("id", { count: "exact", head: true }) as unknown as PgQuery)
          .in("status", statuses)
          .limit(1);
        if (result.error) throw new Error(errorText(result, "Could not count part pictures"));
        return Number(result.count ?? 0);
      };
      const [ready, failed, hidden, inProgress] = await Promise.all([
        count(["ready"]),
        count(["failed"]),
        count(["hidden"]),
        count(["queued", "making"]),
      ]);
      return { ready, failed, hidden, inProgress };
    },

    async countMadeOn(day) {
      // Jamaica has no daylight saving: the calendar day is 00:00-05:00 to the next 00:00-05:00 (as the worker counts).
      const start = new Date(`${day}T00:00:00-05:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const result = await (supabase.from("part_picture")
        .select("id", { count: "exact", head: true }) as unknown as PgQuery)
        .gte("made_at", start.toISOString())
        .lt("made_at", end.toISOString())
        .limit(1);
      if (result.error) throw new Error(errorText(result, "Could not count today's pictures"));
      return Number(result.count ?? 0);
    },

    async sumCostSince(sinceIso) {
      // Every picture that became ready wrote one version row, the current one included, and so did every remake.
      // Summing those is the month's part-picture spend (a picture's own cost_usd would hide the remakes it replaced).
      const result = await (supabase.from("part_picture_version")
        .select("cost_usd, created_at") as unknown as PgQuery)
        .gte("created_at", sinceIso)
        .limit(5000);
      if (result.error) throw new Error(errorText(result, "Could not total the picture spend"));
      let sum = 0;
      for (const row of rows(result)) {
        const cost = Number(row.cost_usd ?? 0);
        if (Number.isFinite(cost)) sum += cost;
      }
      return Math.round(sum * 10000) / 10000;
    },

    async getPicture(id) {
      const result = await (supabase.from("part_picture")
        .select(PART_PICTURE_ADMIN_COLUMNS) as unknown as PgQuery)
        .eq("id", id)
        .maybeSingle();
      if (result.error) throw new Error(errorText(result, "Could not load the picture"));
      const row = rows(result)[0];
      return row ? mapPicture(row) : null;
    },

    async liveDiagramPictureIds(pictureIds) {
      if (!pictureIds.length) return [];
      const result = await (supabase.from("part_picture_diagram")
        .select("picture_id, deleted_at") as unknown as PgQuery)
        .in("picture_id", pictureIds)
        .limit(2000);
      if (result.error) throw new Error(errorText(result, "Could not check the diagrams"));
      const live = new Set<string>();
      for (const row of rows(result)) {
        if (row.deleted_at == null) live.add(String(row.picture_id));
      }
      return [...live];
    },

    async remake(id, nextVersion, nowIso) {
      // The file and made_at stay: a remake that fails leaves the last good picture in place (§4 S2).
      const result = await (supabase.from("part_picture").update({
        status: "queued",
        version: nextVersion,
        attempts: 0,
        next_attempt_at: nowIso,
        lease_until: null,
        last_error: null,
      }) as unknown as PgWrite).eq("id", id);
      if (result.error) throw new Error(errorText(result, "Could not queue the remake"));
    },

    async hide(id, actorId, nowIso) {
      // The file stays, so Show brings the same picture back (PP-09).
      const result = await (supabase.from("part_picture").update({
        status: "hidden",
        hidden_at: nowIso,
        hidden_by: actorId,
      }) as unknown as PgWrite).eq("id", id);
      if (result.error) throw new Error(errorText(result, "Could not hide the picture"));
    },

    async show(id) {
      const result = await (supabase.from("part_picture").update({
        status: "ready",
        hidden_at: null,
        hidden_by: null,
      }) as unknown as PgWrite).eq("id", id);
      if (result.error) throw new Error(errorText(result, "Could not show the picture"));
    },

    async loadTemplates() {
      const result = await (supabase.from("part_picture_template")
        .select(PART_PICTURE_TEMPLATE_COLUMNS) as unknown as PgQuery).limit(100);
      if (result.error) throw new Error(errorText(result, "Could not load the templates"));
      return rows(result).map(mapTemplate);
    },

    async getTemplate(catalogGroupId) {
      const result = await (supabase.from("part_picture_template")
        .select(PART_PICTURE_TEMPLATE_COLUMNS) as unknown as PgQuery)
        .eq("catalog_group_id", catalogGroupId)
        .maybeSingle();
      if (result.error) throw new Error(errorText(result, "Could not load the template"));
      const row = rows(result)[0];
      return row ? mapTemplate(row) : null;
    },

    async saveTemplate(catalogGroupId, patch, actorId, nextVersion) {
      const update: Record<string, unknown> = { version: nextVersion, updated_by: actorId };
      if (patch.materials !== undefined) update.materials = patch.materials;
      if (patch.enabled !== undefined) update.enabled = patch.enabled;
      const result = await (supabase.from("part_picture_template")
        .update(update) as unknown as PgWrite)
        .eq("catalog_group_id", catalogGroupId)
        .select(PART_PICTURE_TEMPLATE_COLUMNS)
        .single();
      if (result.error) throw new Error(errorText(result, "Could not save the template"));
      const row = result.data as Record<string, unknown> | null | undefined;
      return row ? mapTemplate(row) : null;
    },

    async outdatedPictures(catalogGroupId, templateVersion) {
      // Same rule as the car pictures: an older template, or made before the template was recorded at all.
      const result = await (supabase.from("part_picture")
        .select(PART_PICTURE_ADMIN_COLUMNS) as unknown as PgQuery)
        .eq("catalog_group_id", catalogGroupId)
        .eq("status", "ready")
        .limit(2000);
      if (result.error) throw new Error(errorText(result, "Could not load the pictures"));
      return rows(result)
        .map(mapPicture)
        .filter((row) => row.template_version == null || row.template_version < templateVersion);
    },

    async queueForRemake(ids, nowIso) {
      let queued = 0;
      for (const id of ids) {
        const picture = await db.getPicture(id);
        if (!picture || picture.status !== "ready") continue;
        await db.remake(id, picture.version + 1, nowIso);
        queued += 1;
      }
      return queued;
    },

    async interchangeGroupsForNumbers(norms) {
      const wanted = [...new Set(norms.map((n) => norm(n)).filter(Boolean))];
      const map = new Map<string, string>();
      if (!wanted.length) return map;
      const result = await (supabase.from("part_master")
        .select("oem_part_number, oem_part_number_norm, interchange_group_id, catalog_decision") as unknown as PgQuery)
        .in("oem_part_number_norm", wanted)
        .limit(2000);
      if (result.error) throw new Error(errorText(result, "Could not match the part numbers"));
      for (const row of rows(result)) {
        if (String(row.catalog_decision ?? "") === "rejected") continue;
        const groupId = row.interchange_group_id != null ? String(row.interchange_group_id) : "";
        const key = norm(String(row.oem_part_number_norm ?? row.oem_part_number ?? ""));
        if (groupId && key) map.set(key, groupId);
      }
      return map;
    },

    async picturesByGroupIds(groupIds) {
      const wanted = [...new Set(groupIds.filter(Boolean))];
      if (!wanted.length) return [];
      const result = await (supabase.from("part_picture")
        .select(PART_PICTURE_ADMIN_COLUMNS) as unknown as PgQuery)
        .in("interchange_group_id", wanted)
        .limit(500);
      if (result.error) throw new Error(errorText(result, "Could not load the pictures"));
      return rows(result).map(mapPicture);
    },

    async groupNames(ids) {
      const wanted = [...new Set(ids.filter(Boolean))];
      const map = new Map<string, string>();
      if (!wanted.length) return map;
      const result = await (supabase.from("maintenance_service_categories")
        .select("id, name") as unknown as PgQuery)
        .in("id", wanted)
        .limit(200);
      if (result.error) throw new Error(errorText(result, "Could not load the part groups"));
      for (const row of rows(result)) map.set(String(row.id), String(row.name ?? ""));
      return map;
    },
  };

  return db;
}
