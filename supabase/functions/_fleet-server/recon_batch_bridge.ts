/**
 * Forward write bridge: classic / recon commits register fleet.import_batches
 * with source_id + coverage so Week Recon coverage stays aligned with Driver Ops.
 */
import { getServiceClient } from "./service_client.ts";

export type ReconBatchSourceId =
  | "uber_bundle"
  | "indrive_trips"
  | "toll_usage"
  | "toll_topup"
  | "fuel_card_roam"
  | "fuel_card_self";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymd(raw: string | null | undefined): string | null {
  const s = String(raw || "").slice(0, 10);
  return YMD.test(s) ? s : null;
}

function semanticKeyFor(
  sourceId: ReconBatchSourceId,
  orgId: string,
  coverageStart: string,
  coverageEnd: string,
): string {
  if (sourceId === "uber_bundle") return `uber:${orgId}:${coverageStart}:${coverageEnd}`;
  if (sourceId === "indrive_trips") return `indrive:${orgId}:${coverageStart}:${coverageEnd}`;
  if (sourceId.startsWith("toll_")) return `toll:${sourceId}:${orgId}:${coverageStart}:${coverageEnd}`;
  return `fuel:${sourceId}:${orgId}:${coverageStart}:${coverageEnd}`;
}

export type EnsureReconImportBatchInput = {
  batchId: string;
  orgId: string;
  sourceId: ReconBatchSourceId;
  coverageStart: string;
  coverageEnd: string;
  /** First/last transaction date. Defaults to the declared coverage when omitted. */
  dataStart?: string | null;
  dataEnd?: string | null;
  status?: "completed" | "committed";
  rowsCommitted?: number | null;
  fileName?: string | null;
  type?: string | null;
};

/**
 * Idempotent upsert into fleet.import_batches (via public fleet_import_batches view).
 * Prefer calling after a successful classic or recon commit.
 */
export async function ensureReconImportBatch(
  input: EnsureReconImportBatchInput,
): Promise<{ ok: boolean; error?: string }> {
  const batchId = String(input.batchId || "").trim();
  const orgId = String(input.orgId || "").trim();
  const coverageStart = ymd(input.coverageStart);
  const coverageEnd = ymd(input.coverageEnd);
  const dataStart = ymd(input.dataStart) ?? coverageStart;
  const dataEnd = ymd(input.dataEnd) ?? coverageEnd;
  if (!batchId || !orgId || !coverageStart || !coverageEnd || !dataStart || !dataEnd) {
    return { ok: false, error: "batchId, orgId, coverageStart, coverageEnd required" };
  }

  const status = input.status ?? "completed";
  const semanticKey = semanticKeyFor(input.sourceId, orgId, coverageStart, coverageEnd);
  const now = new Date().toISOString();
  const sb = getServiceClient();

  // Supersede other live peers with the same semantic key (unique index).
  const { data: peers } = await sb
    .from("fleet_import_batches")
    .select("id")
    .eq("organization_id", orgId)
    .eq("semantic_key", semanticKey)
    .in("status", ["completed", "committed"])
    .neq("id", batchId)
    .limit(20);
  for (const peer of peers ?? []) {
    const peerId = String((peer as { id: string }).id || "");
    if (!peerId) continue;
    await sb
      .from("fleet_import_batches")
      .update({ status: "superseded", updated_at: now })
      .eq("id", peerId)
      .eq("organization_id", orgId);
  }

  const row = {
    id: batchId,
    organization_id: orgId,
    legacy_kv_id: batchId.startsWith("batch:") ? batchId : `batch:${batchId}`,
    file_name: input.fileName ?? null,
    upload_date: now,
    status,
    record_count: input.rowsCommitted ?? null,
    type: input.type ?? input.sourceId,
    period_start: coverageStart,
    period_end: coverageEnd,
    source_id: input.sourceId,
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    data_start: dataStart,
    data_end: dataEnd,
    semantic_key: semanticKey,
    rows_committed: input.rowsCommitted ?? null,
    updated_at: now,
    payload_json: {
      sourceId: input.sourceId,
      coverageStart,
      coverageEnd,
      dataStart,
      dataEnd,
      reconBridge: true,
    },
  };

  const { error } = await sb.from("fleet_import_batches").upsert(row, { onConflict: "id" });
  if (error) {
    console.warn("[recon-batch-bridge] upsert failed", batchId, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Infer toll source_id from ledger type for classic imports. */
export function tollSourceIdFromType(type: string | null | undefined): "toll_usage" | "toll_topup" {
  const t = String(type || "").toLowerCase();
  if (t.includes("top")) return "toll_topup";
  return "toll_usage";
}
