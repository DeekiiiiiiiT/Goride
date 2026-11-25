/**
 * Ephemeral evidence storage helpers — 14-day retention after approve/reject.
 * New files live in Cloudflare R2 (roam-private) when FILE_LINK_SECRET + R2 keys are set;
 * older files stay in the Supabase buckets until the M4 copy. See
 * docs/cloudflare-r2-storage-migration-audit.md.
 */
import {
  keyFromFileLink,
  R2_PRIVATE_BUCKET_ID,
} from "../_shared/objectStorage/fileLink.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";

export { R2_PRIVATE_BUCKET_ID };

export const EVIDENCE_RETENTION_DAYS = 14;
export const EPHEMERAL_EVIDENCE_BUCKET = "ephemeral-evidence";
export const LEGACY_DOCS_BUCKET = "make-37f42386-docs";

export type EvidenceType =
  | "fuel_receipt"
  | "toll_receipt"
  | "odometer_proof"
  | "maintenance_invoice"
  | "driver_report_update";

export type EvidenceSourceType =
  | "transaction"
  | "fuel_entry"
  | "maintenance_log"
  | "driver_report";

export function isEvidenceTtlEnabled(): boolean {
  return Deno.env.get("EVIDENCE_TTL_ENABLED") === "true";
}

export function parseStoragePathFromUrl(
  url: string,
): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;

  const r2Key = keyFromFileLink(url);
  if (r2Key) return { bucket: R2_PRIVATE_BUCKET_ID, path: r2Key };

  for (const bucket of [EPHEMERAL_EVIDENCE_BUCKET, LEGACY_DOCS_BUCKET]) {
    const marker = `${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) continue;
    const raw = url.slice(idx + marker.length).split("?")[0];
    if (raw) return { bucket, path: decodeURIComponent(raw) };
  }

  // Signed URL path: /storage/v1/object/sign/bucket/path
  const signMatch = url.match(
    /\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+?)(?:\?|$)/,
  );
  if (signMatch) {
    return {
      bucket: signMatch[1],
      path: decodeURIComponent(signMatch[2]),
    };
  }

  return null;
}

export function computeDeleteAfter(resolvedAt: Date): string {
  const d = new Date(resolvedAt);
  d.setUTCDate(d.getUTCDate() + EVIDENCE_RETENTION_DAYS);
  return d.toISOString();
}

/** True when new uploads should go to R2 (all three R2 keys + FILE_LINK_SECRET set). */
export function isR2EvidenceEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "FILE_LINK_SECRET", "SUPABASE_URL"]
    .every((n) => !!env(n)?.trim());
}

/** R2 key for a new upload: evidence/<org>/<type>/<uuid>.<ext> or fleet-docs/<org>/driver-docs/<uuid>.<ext>. */
export function buildR2UploadKey(
  orgId: string | null | undefined,
  evidenceType: EvidenceType | null,
  fileExt: string,
): string {
  const safeOrg = (orgId || "").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^[_-]+/, "") || "no-org";
  const ext = fileExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const id = crypto.randomUUID();
  return evidenceType
    ? `evidence/${safeOrg}/${evidenceType}/${id}.${ext}`
    : `fleet-docs/${safeOrg}/driver-docs/${id}.${ext}`;
}

export type RemoveObjects = (bucket: string, paths: string[]) => Promise<{ error: { message: string } | null }>;

/**
 * Deletes stored files wherever they live: R2 ("r2:private") or a Supabase bucket.
 * Never throws; returns the error message per failed batch.
 */
export async function removeStoredFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  r2Remove: (keys: string[]) => Promise<void> = (keys) => r2FromEnv().remove("private", keys),
): Promise<{ removed: number; errors: string[] }> {
  let removed = 0;
  const errors: string[] = [];
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    try {
      if (bucket === R2_PRIVATE_BUCKET_ID) {
        await r2Remove(chunk);
      } else {
        const { error } = await supabase.storage.from(bucket).remove(chunk);
        if (error) throw error;
      }
      removed += chunk.length;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    }
  }
  return { removed, errors };
}

export function buildEphemeralStoragePath(
  orgId: string,
  evidenceType: EvidenceType,
  fileExt: string,
): string {
  const safeOrg = (orgId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = crypto.randomUUID();
  const ext = fileExt.replace(/^\./, "") || "jpg";
  return `${safeOrg}/${evidenceType}/${id}.${ext}`;
}

export function isPendingParentStatus(status?: string | null): boolean {
  if (!status) return true;
  const s = status.toLowerCase();
  return s === "pending" || s.includes("review");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface RegisterEvidenceInput {
  bucketId: string;
  storagePath: string;
  evidenceType: EvidenceType;
  sourceType: EvidenceSourceType;
  sourceId: string;
  orgId?: string | null;
  publicUrl?: string | null;
  parentStatus?: string | null;
  retentionClass?: "ephemeral" | "permanent";
  /** Bytes on disk — stored in metadata.size for Storage Center tiles */
  fileSizeBytes?: number | null;
  contentType?: string | null;
}

export async function registerEvidenceFile(
  supabase: SupabaseClient,
  input: RegisterEvidenceInput,
): Promise<{ id: string } | null> {
  const pending = isPendingParentStatus(input.parentStatus);
  const status = pending ? "pending_hold" : "scheduled";
  const resolvedAt = pending ? null : new Date().toISOString();
  const deleteAfter = pending
    ? null
    : computeDeleteAfter(new Date(resolvedAt!));

  const metadata: Record<string, unknown> = {};
  if (input.fileSizeBytes != null && input.fileSizeBytes > 0) {
    metadata.size = input.fileSizeBytes;
  }
  if (input.contentType) metadata.contentType = input.contentType;

  const { data, error } = await supabase
    .from("evidence_files")
    .insert({
      bucket_id: input.bucketId,
      storage_path: input.storagePath,
      evidence_type: input.evidenceType,
      retention_class: input.retentionClass ?? "ephemeral",
      source_type: input.sourceType,
      source_id: input.sourceId,
      org_id: input.orgId ?? null,
      public_url: input.publicUrl ?? null,
      status,
      resolved_at: resolvedAt,
      delete_after: deleteAfter,
      metadata: Object.keys(metadata).length ? metadata : {},
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[evidence_storage] registerEvidenceFile failed:", error.message);
    return null;
  }
  return data;
}

export async function scheduleEvidenceDeletion(
  supabase: SupabaseClient,
  sourceType: EvidenceSourceType,
  sourceId: string,
  resolvedAt: Date = new Date(),
): Promise<number> {
  const deleteAfter = computeDeleteAfter(resolvedAt);
  const { data, error } = await supabase
    .from("evidence_files")
    .update({
      status: "scheduled",
      resolved_at: resolvedAt.toISOString(),
      delete_after: deleteAfter,
    })
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .in("status", ["pending_hold", "active", "scheduled"])
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.warn("[evidence_storage] scheduleEvidenceDeletion failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function markEvidenceFilesDeleted(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  const now = new Date().toISOString();
  await supabase
    .from("evidence_files")
    .update({ status: "deleted", deleted_at: now })
    .in("storage_path", paths)
    .is("deleted_at", null);
}

export function extractEvidenceUrlsFromRecord(
  record: Record<string, unknown> | null | undefined,
): string[] {
  if (!record) return [];
  const urls: string[] = [];
  const fields = [
    "receiptUrl",
    "invoiceUrl",
    "odometerProofUrl",
    "photoUrl",
    "imageUrl",
    "fileUrl",
  ];
  for (const field of fields) {
    const v = record[field];
    if (typeof v === "string" && v) urls.push(v);
  }
  const meta = record.metadata as Record<string, unknown> | undefined;
  if (meta) {
    for (const field of fields) {
      const v = meta[field];
      if (typeof v === "string" && v) urls.push(v);
    }
    const odo = meta.odometerProofUrl;
    if (typeof odo === "string" && odo) urls.push(odo);
  }
  return [...new Set(urls)];
}

export function storagePathsFromUrls(urls: string[]): {
  bucket: string;
  path: string;
}[] {
  const out: { bucket: string; path: string }[] = [];
  for (const url of urls) {
    const parsed = parseStoragePathFromUrl(url);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function collectStoragePathsFromRecord(
  record: Record<string, unknown> | null | undefined,
): { bucket: string; path: string }[] {
  return storagePathsFromUrls(extractEvidenceUrlsFromRecord(record));
}

export interface EvidenceCleanupResult {
  purged: number;
  kvPatched: number;
  errors: string[];
  dryRun?: boolean;
  wouldPurge?: number;
}

export function recordOrganizationId(
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record) return null;
  const raw =
    record.organizationId ??
    (record.metadata as { organizationId?: unknown } | undefined)?.organizationId;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Legacy docs paths referenced from KV (optionally scoped to one org). */
export async function collectReferencedLegacyPaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { getByPrefix: (p: string) => Promise<any[]> },
  orgId?: string | null,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  const txs = await kv.getByPrefix("transaction:");
  const fuel = await kv.getByPrefix("fuel_entry:");
  const maint = await kv.getByPrefix("maintenance_log:");
  for (const rec of [...(txs || []), ...(fuel || []), ...(maint || [])]) {
    if (orgId) {
      const recOrg = recordOrganizationId(rec);
      if (recOrg !== orgId) continue;
    }
    for (const url of extractEvidenceUrlsFromRecord(rec)) {
      const parsed = parseStoragePathFromUrl(url);
      if (parsed?.bucket === LEGACY_DOCS_BUCKET) {
        referenced.add(parsed.path);
      }
    }
  }
  return referenced;
}

export type LinkedLegacyRef = {
  path: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  orgId: string | null;
};

/** Linked legacy paths with source metadata (for org drill-in / scoped purge). */
export async function collectLinkedLegacyRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { getByPrefix: (p: string) => Promise<any[]> },
  orgId?: string | null,
): Promise<LinkedLegacyRef[]> {
  const byPath = new Map<string, LinkedLegacyRef>();
  const batches: { prefix: string; sourceType: EvidenceSourceType }[] = [
    { prefix: "transaction:", sourceType: "transaction" },
    { prefix: "fuel_entry:", sourceType: "fuel_entry" },
    { prefix: "maintenance_log:", sourceType: "maintenance_log" },
  ];
  for (const { prefix, sourceType } of batches) {
    const rows = await kv.getByPrefix(prefix);
    for (const rec of rows || []) {
      const recOrg = recordOrganizationId(rec);
      if (orgId && recOrg !== orgId) continue;
      const sourceId = String(rec?.id ?? "").trim();
      if (!sourceId) continue;
      for (const url of extractEvidenceUrlsFromRecord(rec)) {
        const parsed = parseStoragePathFromUrl(url);
        if (parsed?.bucket !== LEGACY_DOCS_BUCKET) continue;
        if (!byPath.has(parsed.path)) {
          byPath.set(parsed.path, {
            path: parsed.path,
            sourceType,
            sourceId,
            orgId: recOrg,
          });
        }
      }
    }
  }
  return [...byPath.values()];
}

export type LinkedVehicleRef = {
  path: string;
  vehicleId: string;
  licensePlate: string | null;
  orgId: string | null;
};

export async function collectLinkedVehicleRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { getByPrefix: (p: string) => Promise<any[]> },
  orgId?: string | null,
): Promise<LinkedVehicleRef[]> {
  const byPath = new Map<string, LinkedVehicleRef>();
  const vehicles = await kv.getByPrefix("vehicle:");
  for (const rec of vehicles || []) {
    const recOrg = recordOrganizationId(rec);
    if (orgId && recOrg !== orgId) continue;
    const imageUrl =
      (typeof rec?.image === "string" && rec.image) ||
      (typeof rec?.imageUrl === "string" && rec.imageUrl) ||
      "";
    if (!imageUrl) continue;
    const parsed = parseStoragePathFromUrl(imageUrl);
    if (!parsed || parsed.bucket !== "make-37f42386-vehicles") continue;
    const vehicleId = String(rec?.id ?? "").trim();
    if (!vehicleId) continue;
    if (!byPath.has(parsed.path)) {
      byPath.set(parsed.path, {
        path: parsed.path,
        vehicleId,
        licensePlate:
          typeof rec?.licensePlate === "string" ? rec.licensePlate : null,
        orgId: recOrg,
      });
    }
  }
  return [...byPath.values()];
}

export async function runEvidenceCleanup(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { getByPrefix: (p: string) => Promise<any[]>; get: (k: string) => Promise<any>; set: (k: string, v: any) => Promise<void> },
  options: { dryRun?: boolean; orgId?: string | null } = {},
): Promise<EvidenceCleanupResult> {
  if (!isEvidenceTtlEnabled()) {
    return { purged: 0, kvPatched: 0, errors: [], dryRun: options.dryRun };
  }

  const now = new Date().toISOString();
  let query = supabase
    .from("evidence_files")
    .select("id, bucket_id, storage_path, public_url, org_id")
    .eq("status", "scheduled")
    .lte("delete_after", now)
    .is("deleted_at", null)
    .limit(200);
  if (options.orgId) {
    query = query.eq("org_id", options.orgId);
  }
  const { data: dueRows, error } = await query;

  if (error) {
    const detail =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error);
    throw new Error(`evidence_files query failed: ${detail}`);
  }
  const rows = dueRows || [];

  if (options.dryRun) {
    return { purged: 0, kvPatched: 0, errors: [], dryRun: true, wouldPurge: rows.length };
  }

  const byBucket = new Map<string, string[]>();
  for (const row of rows) {
    const bucket = row.bucket_id || EPHEMERAL_EVIDENCE_BUCKET;
    const list = byBucket.get(bucket) || [];
    list.push(row.storage_path);
    byBucket.set(bucket, list);
  }

  let filesDeleted = 0;
  const errors: string[] = [];
  for (const [bucket, paths] of byBucket) {
    const res = await removeStoredFiles(supabase, bucket, paths);
    filesDeleted += res.removed;
    errors.push(...res.errors);
  }

  await markEvidenceFilesDeleted(
    supabase,
    rows.map((r: { storage_path: string }) => r.storage_path),
  );

  const urls: string[] = (rows as { public_url?: string | null }[])
    .map((r) => r.public_url)
    .filter((u): u is string => typeof u === "string" && !!u);

  let kvPatched = 0;
  if (urls.length) {
    const txs = await kv.getByPrefix("transaction:");
    for (const tx of txs || []) {
      const txUrls = extractEvidenceUrlsFromRecord(tx);
      if (!urls.some((u) => txUrls.includes(u))) continue;
      const id = tx.id;
      if (!id) continue;
      const full = await kv.get(`transaction:${id}`);
      if (!full) continue;
      full.metadata = { ...(full.metadata || {}), evidenceExpired: true };
      await kv.set(`transaction:${id}`, full);
      kvPatched++;
    }
  }

  return { purged: filesDeleted, kvPatched, errors };
}
