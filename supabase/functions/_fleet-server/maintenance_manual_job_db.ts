/**
 * Step 3 — database access for the manual page worker.
 *
 * Every concurrency-sensitive step is one SQL function from the step-3 migration (claim, sweep, attempts, finish),
 * never an ad-hoc update that could race a second run. Reads name their columns explicitly: these tables are
 * server-only, so a `select('*')` would silently start returning anything added later.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { DraftRuleRow } from "./maintenance_manual_draft.ts";
import type { CategoryRow } from "./maintenance_manual_match.ts";
import type { ManualReaderName } from "./maintenance_manual_settings.ts";
import type { ParsedSpecRow, SpecVersion } from "./maintenance_manual_specs_prompt.ts";

export const MANUAL_PAGE_JOB_COLUMNS =
  "id, manual_id, page_no, status, attempts, error, rows_found, reader, lease_until, next_attempt_at, started_at, finished_at";

export const MANUAL_COLUMNS =
  "id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, pages, doc_type, page_offset, year_from, year_to, printed_date, status, progress_page, reject_reason, stop_reason";

export type PageJobStatus = "queued" | "reading" | "done" | "failed" | "skipped";

export type PageJobRow = {
  id: string;
  manual_id: string;
  page_no: number;
  status: PageJobStatus;
  attempts: number;
  error: string | null;
  rows_found: number | null;
  /** Which reader produced this page's rows (deepseek / gemini), or null for a page read before it was recorded. */
  reader: string | null;
  lease_until: string | null;
  next_attempt_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type ManualRow = {
  id: string;
  platform_id: string;
  market: string;
  title: string;
  file_key: string;
  file_sha256: string;
  page_count: number;
  page_from: number;
  page_to: number;
  /** The PDF pages to read. page_from/page_to are its min and max. */
  pages: number[];
  /** `schedule` reads for intervals only; `owners_manual` reads for specs and for any intervals it prints. */
  doc_type: "schedule" | "owners_manual";
  /** printed page = PDF page - this. */
  page_offset: number;
  year_from: number | null;
  year_to: number | null;
  printed_date: string | null;
  status: "reading" | "waiting_check" | "checked" | "rejected" | "stopped";
  progress_page: number | null;
  reject_reason: string | null;
  stop_reason: string | null;
};

/** One spec row as the page-draft writer takes it. */
export type DraftSpecRow = ParsedSpecRow & {
  version_ids: string[];
  draft_note: string | null;
};

export type ManualJobDb = {
  tryAcquireWorkerLease(holderId: string, heldUntilIso: string): Promise<boolean>;
  releaseWorkerLease(holderId: string): Promise<void>;
  claimPages(limit: number, leaseSeconds: number): Promise<PageJobRow[]>;
  sweepStuck(): Promise<number>;
  incrementAttempts(jobId: string): Promise<number>;
  requeue(jobId: string, nextAttemptIso: string): Promise<void>;
  requeueGiveBack(jobId: string, nextAttemptIso: string): Promise<void>;
  finishPage(
    jobId: string,
    status: "done" | "failed" | "skipped",
    rowsFound: number | null,
    error: string | null,
    reader?: ManualReaderName | null,
  ): Promise<void>;
  loadManual(manualId: string): Promise<ManualRow | null>;
  replacePageDrafts(manualId: string, pageNo: number, rows: DraftRuleRow[]): Promise<number>;
  replacePageSpecs(manualId: string, pageNo: number, rows: DraftSpecRow[]): Promise<number>;
  loadCategories(): Promise<CategoryRow[]>;
  /** The catalogue versions of a model family, for pre-ticking a spec row's "applies to". */
  loadVersions(platformId: string): Promise<SpecVersion[]>;
};

function textOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function mapJob(data: Record<string, unknown>): PageJobRow {
  return {
    id: String(data.id),
    manual_id: String(data.manual_id),
    page_no: Number(data.page_no ?? 0),
    status: String(data.status ?? "queued") as PageJobStatus,
    attempts: Number(data.attempts ?? 0),
    error: textOrNull(data.error),
    rows_found: data.rows_found == null ? null : Number(data.rows_found),
    reader: textOrNull(data.reader),
    lease_until: textOrNull(data.lease_until),
    next_attempt_at: textOrNull(data.next_attempt_at),
    started_at: textOrNull(data.started_at),
    finished_at: textOrNull(data.finished_at),
  };
}

function mapManual(data: Record<string, unknown>): ManualRow {
  const pages = Array.isArray(data.pages)
    ? (data.pages as unknown[]).map((p) => Number(p)).filter((p) => Number.isInteger(p) && p >= 1)
    : [];
  return {
    id: String(data.id),
    platform_id: String(data.platform_id),
    market: String(data.market ?? ""),
    title: String(data.title ?? ""),
    file_key: String(data.file_key ?? ""),
    file_sha256: String(data.file_sha256 ?? ""),
    page_count: Number(data.page_count ?? 0),
    page_from: Number(data.page_from ?? 1),
    page_to: Number(data.page_to ?? 1),
    pages: pages.length ? pages : [Number(data.page_from ?? 1)],
    doc_type: String(data.doc_type ?? "schedule") === "owners_manual" ? "owners_manual" : "schedule",
    page_offset: Number(data.page_offset ?? 0),
    year_from: data.year_from == null ? null : Number(data.year_from),
    year_to: data.year_to == null ? null : Number(data.year_to),
    printed_date: data.printed_date == null ? null : String(data.printed_date),
    status: String(data.status ?? "reading") as ManualRow["status"],
    progress_page: data.progress_page == null ? null : Number(data.progress_page),
    reject_reason: textOrNull(data.reject_reason),
    stop_reason: textOrNull(data.stop_reason),
  };
}

export function createManualJobDb(supabase: SupabaseClient): ManualJobDb {
  return {
    async tryAcquireWorkerLease(holderId, heldUntilIso) {
      const { data, error } = await supabase.rpc("maintenance_manual_try_worker_lease", {
        p_holder: holderId,
        p_held_until: heldUntilIso,
      });
      if (error) throw error;
      return data === true;
    },

    async releaseWorkerLease(holderId) {
      const { error } = await supabase.rpc("maintenance_manual_release_worker_lease", { p_holder: holderId });
      if (error) throw error;
    },

    async claimPages(limit, leaseSeconds) {
      const { data, error } = await supabase.rpc("maintenance_manual_claim_pages", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map(mapJob);
    },

    async sweepStuck() {
      const { data, error } = await supabase.rpc("maintenance_manual_sweep_stuck");
      if (error) throw error;
      return Number(data ?? 0);
    },

    async incrementAttempts(jobId) {
      const { data, error } = await supabase.rpc("maintenance_manual_increment_page_attempts", { p_id: jobId });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async requeue(jobId, nextAttemptIso) {
      const { error } = await supabase.rpc("maintenance_manual_page_requeue", {
        p_id: jobId,
        p_next_attempt_at: nextAttemptIso,
      });
      if (error) throw error;
    },

    async requeueGiveBack(jobId, nextAttemptIso) {
      const { error } = await supabase.rpc("maintenance_manual_page_requeue_give_back", {
        p_id: jobId,
        p_next_attempt_at: nextAttemptIso,
      });
      if (error) throw error;
    },

    async finishPage(jobId, status, rowsFound, error, reader) {
      const { error: rpcError } = await supabase.rpc("maintenance_manual_finish_page", {
        p_job_id: jobId,
        p_status: status,
        p_rows_found: rowsFound,
        p_error: error,
        p_reader: reader ?? null,
      });
      if (rpcError) throw rpcError;
    },

    async loadManual(manualId) {
      const { data, error } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", manualId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapManual(data as Record<string, unknown>) : null;
    },

    async replacePageDrafts(manualId, pageNo, rows) {
      const { data, error } = await supabase.rpc("maintenance_manual_replace_page_drafts", {
        p_manual_id: manualId,
        p_page_no: pageNo,
        p_rows: rows,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async replacePageSpecs(manualId, pageNo, rows) {
      const payload = rows.map((row) => ({
        kind: row.kind,
        key: row.key,
        value: row.value,
        applies_to: row.appliesTo,
        version_ids: row.version_ids,
        confidence: row.confidence,
        draft_note: row.draft_note,
      }));
      const { data, error } = await supabase.rpc("maintenance_manual_replace_page_specs", {
        p_manual_id: manualId,
        p_page_no: pageNo,
        p_rows: payload,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async loadVersions(platformId) {
      // The family's own row plus every platform under it, the same reach the catalogue screens use.
      const { data: children, error: childError } = await supabase
        .from("vehicle_platform")
        .select("id, parent_id")
        .eq("parent_id", platformId);
      if (childError) throw childError;

      const platformIds = [platformId, ...((children ?? []) as Array<{ id: string }>).map((c) => String(c.id))];

      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select("id, production_start_year, production_end_year, drivetrain, engine_type, catalog_trim, full_model_code")
        .in("platform_id", platformIds)
        .order("production_start_year", { ascending: true })
        .limit(200);
      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const from = row.production_start_year == null ? null : Number(row.production_start_year);
        const to = row.production_end_year == null ? null : Number(row.production_end_year);
        const years = from ? `${from}–${to ?? ""}`.replace(/–$/, "–") : "";
        const bits = [years, row.drivetrain, row.engine_type, row.catalog_trim, row.full_model_code]
          .map((v) => (v == null ? "" : String(v).trim()))
          .filter(Boolean);
        return {
          id: String(row.id),
          label: bits.join(" · "),
          yearFrom: from,
          yearTo: to,
          drivetrain: row.drivetrain == null ? null : String(row.drivetrain),
          engineType: row.engine_type == null ? null : String(row.engine_type),
          trim: row.catalog_trim == null ? null : String(row.catalog_trim),
        };
      });
    },

    async loadCategories() {
      // Part types only: a system row is a group, not something a maintenance table names.
      const { data, error } = await supabase
        .from("maintenance_service_categories")
        .select("id, name, code")
        .eq("kind", "component")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        code: String(row.code ?? ""),
      }));
    },
  };
}
