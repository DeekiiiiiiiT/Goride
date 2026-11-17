import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { VehicleColor } from "../_shared/vehiclePictures/color.ts";
import { buildLook, type CatalogRow, type VehicleLook } from "../_shared/vehiclePictures/lookKey.ts";
import { jamaicaPictureDay } from "./vehicle_picture_status.ts";
import type { VehiclePictureRow } from "./vehicle_picture_types.ts";

export type VehiclePictureDb = {
  getCatalogRow(catalogId: string): Promise<CatalogRow | null>;
  getCatalogRowsIn(catalogIds: string[]): Promise<Map<string, CatalogRow>>;
  getPicturesByIdsIn(ids: string[]): Promise<Map<string, VehiclePictureRow>>;
  getLivePicturesByLookKeysIn(lookKeys: string[]): Promise<Map<string, VehiclePictureRow>>;
  getLivePictureByLookKey(lookKey: string): Promise<VehiclePictureRow | null>;
  getRemovedPictureByLookKey(lookKey: string): Promise<VehiclePictureRow | null>;
  insertQueuedPicture(look: VehicleLook, orgId: string, catalogId: string | null): Promise<VehiclePictureRow | null>;
  resurrectPicture(id: string): Promise<VehiclePictureRow | null>;
  getPictureById(id: string): Promise<VehiclePictureRow | null>;
  setVehiclePictureId(vehicleId: string, pictureId: string | null): Promise<void>;
  countOrgQueuedToday(orgId: string, now: Date): Promise<number>;
  listVehiclesNeedingPicture(afterId: string | null, limit: number): Promise<
    Array<{ id: string; organization_id: string; vehicle_catalog_id: string; color_standard: string }>
  >;
  tryAcquireWorkerLease(holderId: string, heldUntilIso: string): Promise<boolean>;
  releaseWorkerLease(holderId: string): Promise<void>;
  claimQueuedRows(lane: "live" | "remake", limit: number, leaseUntilIso: string): Promise<VehiclePictureRow[]>;
  releaseClaimedToQueued(id: string): Promise<void>;
  incrementAttempts(id: string): Promise<number>;
  requeuePicture(id: string, nextAttemptIso: string): Promise<void>;
  failPicture(id: string, lastError: string): Promise<void>;
  becomeReady(args: BecomeReadyArgs): Promise<void>;
  sweepStuck(): Promise<number>;
  requeueGiveBackAttempt(id: string, nextAttemptIso?: string): Promise<void>;
  deferAllRemakeRows(nextAttemptIso: string): Promise<void>;
  listVersions(pictureId: string): Promise<VehiclePictureVersionRow[]>;
  markVersionFileDeleted(pictureId: string, version: number, deletedAtIso: string): Promise<void>;
  listCleanupDeleteCandidates(retentionDays: number, now: Date, limit: number): Promise<
    Array<{ pictureId: string; version: number; r2Key: string }>
  >;
  queueRegenerate(id: string, nowIso: string): Promise<VehiclePictureRow | null>;
  softRemovePicture(id: string, nowIso: string): Promise<void>;
  countVehiclesWithPicture(pictureId: string): Promise<number>;
  listCatalogRowsForStaleLooks(): Promise<CatalogRow[]>;
  listAdminPictures(
    filters: AdminPictureListFilters,
  ): Promise<{ items: VehiclePictureRow[]; total: number }>;
  adminPictureCounts(): Promise<AdminPictureStatusCounts>;
  listLivePictureIdsAndLookKeysPage(offset: number, limit: number): Promise<
    Array<{ id: string; look_key: string }>
  >;
  setStalePictureIds(staleIds: string[]): Promise<void>;
  countRemakeLaneActive(): Promise<number>;
  setStaffRating(id: string, rating: "good" | "wrong"): Promise<void>;
  listOutdatedReadyPictureIds(currentPromptVersion: number, currentModel: string): Promise<string[]>;
  queueRemakeBatch(ids: string[], nowIso: string): Promise<number>;
};

export type AdminPictureListFilters = {
  search?: string;
  color?: string;
  status?: string;
  rating?: string;
  staleOnly?: boolean;
  page: number;
  pageSize: number;
};

export type AdminPictureStatusCounts = {
  ready: number;
  beingMade: number;
  failed: number;
  stale: number;
};

export type VehiclePictureVersionRow = {
  picture_id: string;
  version: number;
  r2_key: string;
  source: "ai" | "staff_upload" | "restore";
  cost_usd: number | null;
  provider: string | null;
  ai_model: string | null;
  prompt_version: number | null;
  created_at: string;
  retired_at: string | null;
  file_deleted_at: string | null;
};

export type BecomeReadyArgs = {
  pictureId: string;
  version: number;
  r2Key: string;
  costUsd: number | null;
  provider: string;
  aiModel: string;
  promptVersion: number;
  prompt: string;
  source?: "ai" | "staff_upload" | "restore";
  staffUserId?: string | null;
};

function mapVersionRow(data: Record<string, unknown>): VehiclePictureVersionRow {
  return {
    picture_id: String(data.picture_id),
    version: Number(data.version),
    r2_key: String(data.r2_key),
    source: data.source as VehiclePictureVersionRow["source"],
    cost_usd: data.cost_usd != null ? Number(data.cost_usd) : null,
    provider: data.provider != null ? String(data.provider) : null,
    ai_model: data.ai_model != null ? String(data.ai_model) : null,
    prompt_version: data.prompt_version != null ? Number(data.prompt_version) : null,
    created_at: String(data.created_at ?? new Date().toISOString()),
    retired_at: data.retired_at != null ? String(data.retired_at) : null,
    file_deleted_at: data.file_deleted_at != null ? String(data.file_deleted_at) : null,
  };
}

function mapRow(data: Record<string, unknown>): VehiclePictureRow {
  return {
    id: String(data.id),
    look_key: String(data.look_key),
    make: String(data.make),
    model: String(data.model),
    generation: String(data.generation),
    body_type: String(data.body_type),
    facelift_stage: String(data.facelift_stage),
    start_year: data.start_year != null ? Number(data.start_year) : null,
    end_year: data.end_year != null ? Number(data.end_year) : null,
    color: String(data.color),
    example_catalog_id: data.example_catalog_id != null ? String(data.example_catalog_id) : null,
    status: data.status as VehiclePictureRow["status"],
    lane: (data.lane === "remake" ? "remake" : "live"),
    r2_key: data.r2_key != null ? String(data.r2_key) : null,
    version: Number(data.version ?? 1),
    source: String(data.source ?? "ai"),
    provider: data.provider != null ? String(data.provider) : null,
    ai_model: data.ai_model != null ? String(data.ai_model) : null,
    prompt: data.prompt != null ? String(data.prompt) : null,
    prompt_version: data.prompt_version != null ? Number(data.prompt_version) : null,
    cost_usd: data.cost_usd != null ? Number(data.cost_usd) : null,
    attempts: Number(data.attempts ?? 0),
    next_attempt_at: data.next_attempt_at != null ? String(data.next_attempt_at) : null,
    lease_until: data.lease_until != null ? String(data.lease_until) : null,
    last_error: data.last_error != null ? String(data.last_error) : null,
    staff_rating: data.staff_rating != null ? String(data.staff_rating) : null,
    made_at: data.made_at != null ? String(data.made_at) : null,
    made_by: data.made_by != null ? String(data.made_by) : null,
    deleted_at: data.deleted_at != null ? String(data.deleted_at) : null,
    stale: data.stale === true,
    queued_by_org: data.queued_by_org != null ? String(data.queued_by_org) : null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}

export function createVehiclePictureDb(supabase: SupabaseClient): VehiclePictureDb {
  return {
    async getCatalogRow(catalogId) {
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select(
          "make, model, generation, body_type, trim_series, start_year:production_start_year, end_year:production_end_year",
        )
        .eq("id", catalogId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as CatalogRow;
    },

    async getCatalogRowsIn(catalogIds) {
      const unique = [...new Set(catalogIds.map((id) => String(id).trim()).filter(Boolean))];
      const out = new Map<string, CatalogRow>();
      if (!unique.length) return out;
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select(
          "id, make, model, generation, body_type, trim_series, start_year:production_start_year, end_year:production_end_year",
        )
        .in("id", unique);
      if (error) throw error;
      for (const row of data ?? []) {
        const id = String((row as { id: string }).id);
        const { id: _id, ...catalog } = row as CatalogRow & { id: string };
        out.set(id, catalog as CatalogRow);
      }
      return out;
    },

    async getPicturesByIdsIn(ids) {
      const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
      const out = new Map<string, VehiclePictureRow>();
      if (!unique.length) return out;
      const { data, error } = await supabase.from("vehicle_picture").select("*").in("id", unique);
      if (error) throw error;
      for (const row of data ?? []) {
        const mapped = mapRow(row as Record<string, unknown>);
        out.set(mapped.id, mapped);
      }
      return out;
    },

    async getLivePicturesByLookKeysIn(lookKeys) {
      const unique = [...new Set(lookKeys.map((k) => String(k).trim()).filter(Boolean))];
      const out = new Map<string, VehiclePictureRow>();
      if (!unique.length) return out;
      const { data, error } = await supabase
        .from("vehicle_picture")
        .select("*")
        .in("look_key", unique)
        .is("deleted_at", null);
      if (error) throw error;
      for (const row of data ?? []) {
        const mapped = mapRow(row as Record<string, unknown>);
        out.set(mapped.look_key, mapped);
      }
      return out;
    },

    async getLivePictureByLookKey(lookKey) {
      const { data, error } = await supabase
        .from("vehicle_picture")
        .select("*")
        .eq("look_key", lookKey)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async getRemovedPictureByLookKey(lookKey) {
      const { data, error } = await supabase
        .from("vehicle_picture")
        .select("*")
        .eq("look_key", lookKey)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async insertQueuedPicture(look, orgId, catalogId) {
      const row = {
        look_key: look.key,
        make: look.make,
        model: look.model,
        generation: look.generation,
        body_type: look.bodyType,
        facelift_stage: look.faceliftStage,
        start_year: look.startYear,
        end_year: look.endYear,
        color: look.color,
        example_catalog_id: catalogId,
        status: "queued",
        lane: "live",
        next_attempt_at: new Date().toISOString(),
        queued_by_org: orgId,
      };
      const { data, error } = await supabase
        .from("vehicle_picture")
        .insert(row)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return null;
        throw error;
      }
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async resurrectPicture(id) {
      const { data, error } = await supabase.rpc("vehicle_picture_resurrect", { p_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapRow(row as Record<string, unknown>) : null;
    },

    async getPictureById(id) {
      const { data, error } = await supabase.from("vehicle_picture").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async setVehiclePictureId(vehicleId, pictureId) {
      const { error } = await supabase
        .from("fleet_vehicles")
        .update({ picture_id: pictureId })
        .eq("id", vehicleId);
      if (error) throw error;
    },

    async countOrgQueuedToday(orgId, now) {
      const day = jamaicaPictureDay(now);
      const { data, error } = await supabase.rpc("vehicle_picture_org_day_count", {
        p_org: orgId,
        p_day: day,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async listVehiclesNeedingPicture(afterId, limit) {
      let q = supabase
        .from("fleet_vehicles")
        .select("id, organization_id, vehicle_catalog_id, color_standard")
        .not("vehicle_catalog_id", "is", null)
        .not("color_standard", "is", null)
        .is("picture_id", null)
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId) q = q.gt("id", afterId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id),
        vehicle_catalog_id: String(r.vehicle_catalog_id),
        color_standard: String(r.color_standard),
      }));
    },

    async tryAcquireWorkerLease(holderId, heldUntilIso) {
      const { data, error } = await supabase.rpc("vehicle_picture_try_worker_lease", {
        p_holder: holderId,
        p_held_until: heldUntilIso,
      });
      if (error) throw error;
      return data === true;
    },

    async releaseWorkerLease(holderId) {
      const { error } = await supabase.rpc("vehicle_picture_release_worker_lease", {
        p_holder: holderId,
      });
      if (error) throw error;
    },

    async claimQueuedRows(lane, limit, leaseUntilIso) {
      const nowIso = new Date().toISOString();
      const { data: due, error } = await supabase
        .from("vehicle_picture")
        .select("id")
        .eq("status", "queued")
        .eq("lane", lane)
        .is("deleted_at", null)
        .lte("next_attempt_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      const ids = (due ?? []).map((d) => d.id);
      if (!ids.length) return [];
      const { data: claimed, error: upErr } = await supabase
        .from("vehicle_picture")
        .update({ status: "generating", lease_until: leaseUntilIso })
        .in("id", ids)
        .eq("status", "queued")
        .select("*");
      if (upErr) throw upErr;
      return (claimed ?? []).map((r) => mapRow(r as Record<string, unknown>));
    },

    async releaseClaimedToQueued(id) {
      const { error } = await supabase
        .from("vehicle_picture")
        .update({ status: "queued", lease_until: null })
        .eq("id", id)
        .eq("status", "generating");
      if (error) throw error;
    },

    async incrementAttempts(id) {
      const { data, error } = await supabase.rpc("vehicle_picture_increment_attempts", { p_id: id });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async requeuePicture(id, nextAttemptIso) {
      const { error } = await supabase
        .from("vehicle_picture")
        .update({
          status: "queued",
          next_attempt_at: nextAttemptIso,
          lease_until: null,
        })
        .eq("id", id);
      if (error) throw error;
    },

    async failPicture(id, lastError) {
      const { error } = await supabase
        .from("vehicle_picture")
        .update({ status: "failed", last_error: lastError, lease_until: null })
        .eq("id", id);
      if (error) throw error;
    },

    async becomeReady(args) {
      const { error } = await supabase.rpc("vehicle_picture_become_ready", {
        p_picture_id: args.pictureId,
        p_version: args.version,
        p_r2_key: args.r2Key,
        p_cost_usd: args.costUsd,
        p_provider: args.provider,
        p_ai_model: args.aiModel,
        p_prompt_version: args.promptVersion,
        p_prompt: args.prompt,
        p_source: args.source ?? "ai",
        p_made_by: args.staffUserId ?? null,
      });
      if (error) throw error;
    },

    async sweepStuck() {
      const { data, error } = await supabase.rpc("vehicle_picture_sweep_stuck");
      if (error) throw error;
      return Number(data ?? 0);
    },

    async requeueGiveBackAttempt(id, nextAttemptIso) {
      const next = nextAttemptIso ?? new Date().toISOString();
      const { error } = await supabase.rpc("vehicle_picture_requeue_give_back_attempt", {
        p_id: id,
        p_next_attempt_at: next,
      });
      if (error) throw error;
    },

    async deferAllRemakeRows(nextAttemptIso) {
      const { error: qErr } = await supabase
        .from("vehicle_picture")
        .update({ status: "queued", next_attempt_at: nextAttemptIso, lease_until: null })
        .eq("lane", "remake")
        .eq("status", "queued")
        .is("deleted_at", null);
      if (qErr) throw qErr;
      const { error: gErr } = await supabase
        .from("vehicle_picture")
        .update({ status: "queued", next_attempt_at: nextAttemptIso, lease_until: null })
        .eq("lane", "remake")
        .eq("status", "generating")
        .is("deleted_at", null);
      if (gErr) throw gErr;
    },

    async listVersions(pictureId) {
      const { data, error } = await supabase
        .from("vehicle_picture_version")
        .select("*")
        .eq("picture_id", pictureId)
        .order("version", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapVersionRow(r as Record<string, unknown>));
    },

    async markVersionFileDeleted(pictureId, version, deletedAtIso) {
      const { error } = await supabase
        .from("vehicle_picture_version")
        .update({ file_deleted_at: deletedAtIso })
        .eq("picture_id", pictureId)
        .eq("version", version);
      if (error) throw error;
    },

    async listCleanupDeleteCandidates(retentionDays, now, limit) {
      const { data, error } = await supabase.rpc("vehicle_picture_cleanup_candidates", {
        p_retention_days: retentionDays,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row: { picture_id: string; version: number; r2_key: string }) => ({
        pictureId: String(row.picture_id),
        version: Number(row.version),
        r2Key: String(row.r2_key),
      }));
    },

    async queueRegenerate(id, nowIso) {
      const { data: pic, error: readErr } = await supabase
        .from("vehicle_picture")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!pic) return null;
      const nextVersion = Number((pic as { version: number }).version) + 1;
      const { data, error } = await supabase
        .from("vehicle_picture")
        .update({
          version: nextVersion,
          status: "queued",
          lane: "live",
          next_attempt_at: nowIso,
          lease_until: null,
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async softRemovePicture(id, nowIso) {
      const { error: picErr } = await supabase
        .from("vehicle_picture")
        .update({ deleted_at: nowIso, status: "failed", lease_until: null })
        .eq("id", id);
      if (picErr) throw picErr;
      const { error: verErr } = await supabase
        .from("vehicle_picture_version")
        .update({ retired_at: nowIso })
        .eq("picture_id", id)
        .is("retired_at", null);
      if (verErr) throw verErr;
    },

    async countVehiclesWithPicture(pictureId) {
      const { count, error } = await supabase
        .from("fleet_vehicles")
        .select("id", { count: "exact", head: true })
        .eq("picture_id", pictureId);
      if (error) throw error;
      return Number(count ?? 0);
    },

    async listCatalogRowsForStaleLooks() {
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select(
          "make, model, generation, body_type, trim_series, start_year:production_start_year, end_year:production_end_year",
        )
        .neq("status", "retired");
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },

    async listAdminPictures(filters) {
      const from = (filters.page - 1) * filters.pageSize;
      const to = from + filters.pageSize - 1;
      let q = supabase
        .from("vehicle_picture")
        .select("*", { count: "exact" })
        .is("deleted_at", null);
      if (filters.color?.trim()) q = q.eq("color", filters.color.trim());
      if (filters.status?.trim()) q = q.eq("status", filters.status.trim());
      if (filters.rating?.trim()) q = q.eq("staff_rating", filters.rating.trim());
      const search = filters.search?.trim();
      if (search) {
        const esc = search.replace(/%/g, "\\%");
        q = q.or(`make.ilike.%${esc}%,model.ilike.%${esc}%,generation.ilike.%${esc}%`);
      }
      if (filters.staleOnly) q = q.eq("stale", true);
      const { data, error, count } = await q.order("updated_at", { ascending: false }).range(from, to);
      if (error) throw error;
      const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
      return { items: rows, total: Number(count ?? rows.length) };
    },

    async adminPictureCounts() {
      const { data, error } = await supabase.rpc("vehicle_picture_admin_counts");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | Record<string, unknown>
        | null
        | undefined;
      return {
        ready: Number(row?.ready ?? 0),
        beingMade: Number(row?.being_made ?? 0),
        failed: Number(row?.failed ?? 0),
        stale: Number(row?.stale ?? 0),
      };
    },

    async listLivePictureIdsAndLookKeysPage(offset, limit) {
      const { data, error } = await supabase
        .from("vehicle_picture")
        .select("id, look_key")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String((row as { id: string }).id),
        look_key: String((row as { look_key: string }).look_key),
      }));
    },

    async setStalePictureIds(staleIds) {
      const { error } = await supabase.rpc("vehicle_picture_set_stale", {
        p_stale_ids: staleIds,
      });
      if (error) throw error;
    },

    async countRemakeLaneActive() {
      const { count, error } = await supabase
        .from("vehicle_picture")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("lane", "remake")
        .in("status", ["queued", "generating"]);
      if (error) throw error;
      return Number(count ?? 0);
    },

    async setStaffRating(id, rating) {
      const { error } = await supabase
        .from("vehicle_picture")
        .update({ staff_rating: rating, updated_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null);
      if (error) throw error;
    },

    async listOutdatedReadyPictureIds(currentPromptVersion, currentModel) {
      const { data, error } = await supabase
        .from("vehicle_picture")
        .select("id, prompt_version, ai_model")
        .is("deleted_at", null)
        .eq("status", "ready");
      if (error) throw error;
      const out: string[] = [];
      for (const row of data ?? []) {
        const id = String((row as { id: string }).id);
        const pv = Number((row as { prompt_version: number | null }).prompt_version ?? 0);
        const model = String((row as { ai_model: string | null }).ai_model ?? "");
        if (pv < currentPromptVersion || model !== currentModel) out.push(id);
      }
      return out;
    },

    async queueRemakeBatch(ids, nowIso) {
      let n = 0;
      for (const id of ids) {
        const pic = await this.getPictureById(id);
        if (!pic || pic.deleted_at || pic.status !== "ready") continue;
        const { error } = await supabase
          .from("vehicle_picture")
          .update({
            version: pic.version + 1,
            status: "queued",
            lane: "remake",
            next_attempt_at: nowIso,
            lease_until: null,
          })
          .eq("id", id);
        if (error) throw error;
        n += 1;
      }
      return n;
    },
  };
}

export function buildLookFromCatalog(
  catalog: CatalogRow,
  colorStandard: VehicleColor,
): VehicleLook | { error: string } {
  return buildLook(catalog, colorStandard);
}