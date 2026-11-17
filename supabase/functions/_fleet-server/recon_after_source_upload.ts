/**
 * WRA-70: after an upload saves data for a Week Recon source, register the batch (when
 * applicable) and queue a desk refresh for every week the file touches. Never throws to callers.
 */
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import type { ReconSourceId } from "./recon_sources_mirror.ts";
import { RECON_SOURCES } from "./recon_sources_mirror.ts";
import { uploadWeekKeys } from "./recon_desk_shape.ts";
import {
  ensureReconImportBatch,
  type ReconBatchSourceId,
} from "./recon_batch_bridge.ts";
import { queueWeekDeskRefresh } from "./recon_desk_queue.ts";
import { getServiceClient } from "./service_client.ts";

const BATCH_SOURCE_IDS = new Set<string>([
  "uber_bundle",
  "uber_activity_timeline",
  "indrive_trips",
  "toll_usage",
  "toll_topup",
  "fuel_card_roam",
  "fuel_card_self",
]);

export type ReconLastUpload = {
  uploadedAt: string;
  fileName: string | null;
  rowCount: number | null;
  coverageStart: string;
  coverageEnd: string;
};

export type AfterReconSourceUploadInput = {
  orgId: string;
  sourceId: ReconSourceId;
  coverageStart: string;
  coverageEnd: string;
  weekKey?: string | null;
  rowsCommitted?: number | null;
  fileName?: string | null;
  batchId?: string | null;
  weekKeys?: string[];
  dataStart?: string | null;
  dataEnd?: string | null;
  status?: "completed" | "committed";
  type?: string | null;
};

function ymd(v: string | null | undefined): string | null {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function weekKeysForUpload(input: AfterReconSourceUploadInput): string[] {
  if (input.weekKeys?.length) return [...new Set(input.weekKeys.map((w) => w.slice(0, 10)))];
  return uploadWeekKeys({
    weekKey: input.weekKey,
    coverageStart: input.coverageStart,
    coverageEnd: input.coverageEnd,
  });
}

export async function afterReconSourceUpload(input: AfterReconSourceUploadInput): Promise<void> {
  const orgId = String(input.orgId || "").trim();
  const coverageStart = ymd(input.coverageStart);
  const coverageEnd = ymd(input.coverageEnd);
  if (!orgId) return;

  const weekKeys = weekKeysForUpload(input);

  const batchId = String(input.batchId || "").trim();
  if (batchId && coverageStart && coverageEnd && BATCH_SOURCE_IDS.has(input.sourceId)) {
    try {
      await ensureReconImportBatch({
        batchId,
        orgId,
        sourceId: input.sourceId as ReconBatchSourceId,
        coverageStart,
        coverageEnd,
        dataStart: ymd(input.dataStart) ?? coverageStart,
        dataEnd: ymd(input.dataEnd) ?? coverageEnd,
        status: input.status ?? "completed",
        rowsCommitted: input.rowsCommitted ?? null,
        fileName: input.fileName ?? null,
        type: input.type ?? input.sourceId,
        weekKeys: weekKeys.length ? weekKeys : undefined,
      });
    } catch (e) {
      console.warn("[recon-after-upload] batch bridge failed", e instanceof Error ? e.message : e);
    }
  }

  try {
    await queueWeekDeskRefresh(orgId, weekKeys);
  } catch (e) {
    console.warn("[recon-after-upload] desk refresh failed", e instanceof Error ? e.message : e);
  }
}

const UPLOAD_KIND_SOURCE_IDS: ReconSourceId[] = RECON_SOURCES
  .filter((s) => s.kind === "upload")
  .map((s) => s.id);

/**
 * Latest completed import batch per upload-kind source overlapping this Monday week.
 */
export async function loadLastUploadsForWeek(
  orgId: string,
  weekKey: string,
  sourceIds: readonly ReconSourceId[] = UPLOAD_KIND_SOURCE_IDS,
): Promise<Map<ReconSourceId, ReconLastUpload>> {
  const week = ymd(weekKey);
  const out = new Map<ReconSourceId, ReconLastUpload>();
  if (!orgId || !week || sourceIds.length === 0) return out;

  const weekEnd = periodEndForAnchor(week);
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("fleet_import_batches")
    .select(
      "source_id, upload_date, created_at, file_name, rows_committed, record_count, coverage_start, coverage_end, week_keys",
    )
    .eq("organization_id", orgId)
    .in("source_id", [...sourceIds])
    .in("status", ["completed", "committed"])
    .lte("coverage_start", weekEnd)
    .gte("coverage_end", week)
    .order("upload_date", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[recon-after-upload] last upload read failed", error.message);
    return out;
  }

  for (const row of data ?? []) {
    const sid = String((row as { source_id?: string }).source_id || "") as ReconSourceId;
    if (!sourceIds.includes(sid) || out.has(sid)) continue;

    const weekKeys = (row as { week_keys?: string[] | null }).week_keys;
    if (Array.isArray(weekKeys) && weekKeys.length > 0 && !weekKeys.includes(week)) continue;

    const uploadedAt = String(
      (row as { upload_date?: string }).upload_date ||
        (row as { created_at?: string }).created_at ||
        "",
    );
    const covStart = ymd((row as { coverage_start?: string }).coverage_start);
    const covEnd = ymd((row as { coverage_end?: string }).coverage_end);
    if (!uploadedAt || !covStart || !covEnd) continue;

    const rowCount = Number(
      (row as { rows_committed?: number | null }).rows_committed ??
        (row as { record_count?: number | null }).record_count ??
        NaN,
    );

    out.set(sid, {
      uploadedAt,
      fileName: (row as { file_name?: string | null }).file_name ?? null,
      rowCount: Number.isFinite(rowCount) ? rowCount : null,
      coverageStart: covStart,
      coverageEnd: covEnd,
    });
  }

  return out;
}