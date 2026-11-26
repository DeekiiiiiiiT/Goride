/**
 * Part pictures — database access for the worker (docs/part-pictures-audit.md §2 D1a, §3.3).
 *
 * Every read names its columns: `part_picture*` is server-only and a `select("*")` would silently start returning
 * any column added later (D7). The seven worker steps are the SQL functions from the data round, never ad-hoc
 * updates that could race another run.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { duePageDrawings, markPageDrawingDeleted } from "./saved_page_diagrams.ts";

/** Explicit column lists — the only shape this module selects. */
export const PART_PICTURE_COLUMNS =
  "id, interchange_group_id, manufacturer, part_number, part_name, catalog_group_id, component_id, status, label, r2_key, version, template_version, prompt, ai_model, cost_usd, attempts, next_attempt_at, lease_until, last_error, made_at, hidden_at, hidden_by, source_saved_page_id, created_at, updated_at";

export const PART_PICTURE_DIAGRAM_COLUMNS =
  "id, picture_id, saved_page_id, r2_key, map_box, delete_after, deleted_at, created_at";

export type PartPictureStatus = "queued" | "making" | "ready" | "failed" | "hidden";

export type PartPictureRow = {
  id: string;
  interchange_group_id: string;
  manufacturer: string;
  part_number: string;
  part_name: string;
  catalog_group_id: string | null;
  component_id: string | null;
  status: PartPictureStatus;
  label: string | null;
  r2_key: string | null;
  version: number;
  template_version: number | null;
  prompt: string | null;
  ai_model: string | null;
  cost_usd: number | null;
  attempts: number;
  next_attempt_at: string | null;
  lease_until: string | null;
  last_error: string | null;
  made_at: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  source_saved_page_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PartPictureDiagramRow = {
  id: string;
  picture_id: string;
  saved_page_id: string | null;
  r2_key: string;
  map_box: unknown;
  delete_after: string;
  deleted_at: string | null;
  created_at: string;
};

export type PartTemplateRow = { catalog_group_id: string; materials: string; enabled: boolean; version: number };

export type PartPictureCleanupCandidate = {
  kind: "version" | "diagram";
  refId: string;
  pictureId: string;
  version: number | null;
  r2Key: string;
};

export type PartPictureBecomeReadyArgs = {
  pictureId: string;
  version: number;
  r2Key: string;
  costUsd: number | null;
  aiModel: string;
  templateVersion: number | null;
  prompt: string;
};

export type PartPictureDb = {
  tryAcquireWorkerLease(holderId: string, heldUntilIso: string): Promise<boolean>;
  releaseWorkerLease(holderId: string): Promise<void>;
  claimRows(limit: number, leaseSeconds: number): Promise<PartPictureRow[]>;
  sweepStuck(): Promise<number>;
  incrementAttempts(id: string): Promise<number>;
  requeue(id: string, nextAttemptIso: string): Promise<void>;
  requeueGiveBackAttempt(id: string, nextAttemptIso: string): Promise<void>;
  fail(id: string, reason: string): Promise<void>;
  becomeReady(args: PartPictureBecomeReadyArgs): Promise<void>;
  listDiagrams(pictureId: string): Promise<PartPictureDiagramRow[]>;
  loadTemplate(catalogGroupId: string): Promise<PartTemplateRow | null>;
  /** Pictures made on one Jamaica calendar day (YYYY-MM-DD), for `daily_max`. */
  countMadeOn(day: string): Promise<number>;
  cleanupCandidates(retentionDays: number, limit: number): Promise<PartPictureCleanupCandidate[]>;
  markVersionFileDeleted(refId: string, deletedAtIso: string): Promise<void>;
  markDiagramDeleted(refId: string, deletedAtIso: string): Promise<void>;
  /**
   * R7: the drawings a saved page kept (research_saved_page_diagram) past their 30 days. Optional so a caller that
   * only knows part_picture* (an older test fake) still works; the live db always has them.
   */
  savedPageDiagramCleanupCandidates?(limit: number, nowIso: string): Promise<Array<{ id: string; r2Key: string }>>;
  markSavedPageDiagramDeleted?(id: string, deletedAtIso: string): Promise<void>;
};

function mapRow(data: Record<string, unknown>): PartPictureRow {
  return {
    id: String(data.id),
    interchange_group_id: String(data.interchange_group_id ?? ""),
    manufacturer: String(data.manufacturer ?? ""),
    part_number: String(data.part_number ?? ""),
    part_name: String(data.part_name ?? ""),
    catalog_group_id: data.catalog_group_id != null ? String(data.catalog_group_id) : null,
    component_id: data.component_id != null ? String(data.component_id) : null,
    status: String(data.status ?? "queued") as PartPictureStatus,
    label: data.label != null ? String(data.label) : null,
    r2_key: data.r2_key != null ? String(data.r2_key) : null,
    version: Number(data.version ?? 1),
    template_version: data.template_version != null ? Number(data.template_version) : null,
    prompt: data.prompt != null ? String(data.prompt) : null,
    ai_model: data.ai_model != null ? String(data.ai_model) : null,
    cost_usd: data.cost_usd != null ? Number(data.cost_usd) : null,
    attempts: Number(data.attempts ?? 0),
    next_attempt_at: data.next_attempt_at != null ? String(data.next_attempt_at) : null,
    lease_until: data.lease_until != null ? String(data.lease_until) : null,
    last_error: data.last_error != null ? String(data.last_error) : null,
    made_at: data.made_at != null ? String(data.made_at) : null,
    hidden_at: data.hidden_at != null ? String(data.hidden_at) : null,
    hidden_by: data.hidden_by != null ? String(data.hidden_by) : null,
    source_saved_page_id: data.source_saved_page_id != null ? String(data.source_saved_page_id) : null,
    created_at: String(data.created_at ?? new Date().toISOString()),
    updated_at: String(data.updated_at ?? new Date().toISOString()),
  };
}

export function createPartPictureDb(supabase: SupabaseClient): PartPictureDb {
  return {
    async tryAcquireWorkerLease(holderId, heldUntilIso) {
      const { data, error } = await supabase.rpc("part_picture_try_worker_lease", {
        p_holder: holderId,
        p_held_until: heldUntilIso,
      });
      if (error) throw error;
      return data === true;
    },

    async releaseWorkerLease(holderId) {
      const { error } = await supabase.rpc("part_picture_release_worker_lease", { p_holder: holderId });
      if (error) throw error;
    },

    async claimRows(limit, leaseSeconds) {
      const { data, error } = await supabase.rpc("part_picture_claim", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
    },

    async sweepStuck() {
      const { data, error } = await supabase.rpc("part_picture_sweep_stuck");
      if (error) throw error;
      return Number(data ?? 0);
    },

    async incrementAttempts(id) {
      const { data, error } = await supabase.rpc("part_picture_increment_attempts", { p_id: id });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async requeue(id, nextAttemptIso) {
      const { error } = await supabase
        .from("part_picture")
        .update({ status: "queued", next_attempt_at: nextAttemptIso, lease_until: null })
        .eq("id", id);
      if (error) throw error;
    },

    async requeueGiveBackAttempt(id, nextAttemptIso) {
      const { error } = await supabase.rpc("part_picture_requeue_give_back_attempt", {
        p_id: id,
        p_next_attempt_at: nextAttemptIso,
      });
      if (error) throw error;
    },

    async fail(id, reason) {
      const { error } = await supabase
        .from("part_picture")
        .update({ status: "failed", last_error: reason, lease_until: null })
        .eq("id", id);
      if (error) throw error;
    },

    async becomeReady(args) {
      const { error } = await supabase.rpc("part_picture_become_ready", {
        p_picture_id: args.pictureId,
        p_version: args.version,
        p_r2_key: args.r2Key,
        p_cost_usd: args.costUsd,
        p_ai_model: args.aiModel,
        p_template_version: args.templateVersion,
        p_prompt: args.prompt,
      });
      if (error) throw error;
    },

    async listDiagrams(pictureId) {
      const { data, error } = await supabase
        .from("part_picture_diagram")
        .select(PART_PICTURE_DIAGRAM_COLUMNS)
        .eq("picture_id", pictureId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(3);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        picture_id: String(row.picture_id),
        saved_page_id: row.saved_page_id != null ? String(row.saved_page_id) : null,
        r2_key: String(row.r2_key),
        map_box: row.map_box,
        delete_after: String(row.delete_after),
        deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
        created_at: String(row.created_at),
      }));
    },

    async loadTemplate(catalogGroupId) {
      const { data, error } = await supabase
        .from("part_picture_template")
        .select("catalog_group_id, materials, enabled, version")
        .eq("catalog_group_id", catalogGroupId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        catalog_group_id: String(row.catalog_group_id),
        materials: String(row.materials ?? ""),
        enabled: row.enabled === true,
        version: Number(row.version ?? 1),
      };
    },

    async countMadeOn(day) {
      // Jamaica has no daylight saving: the calendar day is 00:00-05:00 to 00:00-05:00.
      const start = new Date(`${day}T00:00:00-05:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const { count, error } = await supabase
        .from("part_picture")
        .select("id", { count: "exact", head: true })
        .gte("made_at", start.toISOString())
        .lt("made_at", end.toISOString());
      if (error) throw error;
      return Number(count ?? 0);
    },

    async cleanupCandidates(retentionDays, limit) {
      const { data, error } = await supabase.rpc("part_picture_cleanup_candidates", {
        p_retention_days: retentionDays,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        kind: String(row.kind) === "diagram" ? "diagram" as const : "version" as const,
        refId: String(row.ref_id),
        pictureId: String(row.picture_id),
        version: row.version != null ? Number(row.version) : null,
        r2Key: String(row.r2_key),
      }));
    },

    async markVersionFileDeleted(refId, deletedAtIso) {
      const { error } = await supabase
        .from("part_picture_version")
        .update({ file_deleted_at: deletedAtIso })
        .eq("id", refId);
      if (error) throw error;
    },

    async markDiagramDeleted(refId, deletedAtIso) {
      const { error } = await supabase
        .from("part_picture_diagram")
        .update({ deleted_at: deletedAtIso })
        .eq("id", refId);
      if (error) throw error;
    },

    // R7: the drawings a saved page keeps go 30 days after the upload, even when no picture used them.
    savedPageDiagramCleanupCandidates(limit, nowIso) {
      return duePageDrawings(supabase, limit, nowIso);
    },

    markSavedPageDiagramDeleted(id, deletedAtIso) {
      return markPageDrawingDeleted(supabase, id, deletedAtIso);
    },
  };
}
