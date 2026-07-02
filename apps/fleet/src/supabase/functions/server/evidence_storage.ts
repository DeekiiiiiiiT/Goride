/**
 * Ephemeral evidence storage helpers — 14-day retention after approve/reject.
 */

export const EVIDENCE_RETENTION_DAYS = 14;
export const EPHEMERAL_EVIDENCE_BUCKET = "ephemeral-evidence";
export const LEGACY_DOCS_BUCKET = "make-37f42386-docs";

export type EvidenceType =
  | "fuel_receipt"
  | "toll_receipt"
  | "odometer_proof"
  | "maintenance_invoice";

export type EvidenceSourceType = "transaction" | "fuel_entry" | "maintenance_log";

export function isEvidenceTtlEnabled(): boolean {
  return Deno.env.get("EVIDENCE_TTL_ENABLED") === "true";
}

export function parseStoragePathFromUrl(
  url: string,
): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;

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

const FILE_CHUNK = 50;

export interface EvidenceCleanupResult {
  purged: number;
  kvPatched: number;
  errors: string[];
  dryRun?: boolean;
  wouldPurge?: number;
}

export async function runEvidenceCleanup(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { getByPrefix: (p: string) => Promise<any[]>; get: (k: string) => Promise<any>; set: (k: string, v: any) => Promise<void> },
  options: { dryRun?: boolean } = {},
): Promise<EvidenceCleanupResult> {
  if (!isEvidenceTtlEnabled()) {
    return { purged: 0, kvPatched: 0, errors: [], dryRun: options.dryRun };
  }

  const now = new Date().toISOString();
  const { data: dueRows, error } = await supabase
    .from("evidence_files")
    .select("id, bucket_id, storage_path, public_url")
    .eq("status", "scheduled")
    .lte("delete_after", now)
    .is("deleted_at", null)
    .limit(200);

  if (error) throw error;
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
    for (let i = 0; i < paths.length; i += FILE_CHUNK) {
      const chunk = paths.slice(i, i + FILE_CHUNK);
      const { error: rmErr } = await supabase.storage.from(bucket).remove(chunk);
      if (rmErr) errors.push(rmErr.message);
      else filesDeleted += chunk.length;
    }
  }

  await markEvidenceFilesDeleted(
    supabase,
    rows.map((r: { storage_path: string }) => r.storage_path),
  );

  const urls = rows
    .map((r: { public_url?: string }) => r.public_url)
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
