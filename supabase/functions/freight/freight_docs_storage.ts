/**
 * Freight organisation documents — the Enterprise "Files" library, package + warehouse invoices,
 * retail-order invoices, shipment documents and POD photos. Everything is written through
 * `orgFiles.uploadOrgFile`, so this module is the one place that knows where the bytes live:
 *
 *   new (R2)   freight.org_files.bucket_id = 'r2:private', storage_path = freight-docs/<org>/<kind>/<uuid>.<ext>
 *   old        bucket_id = 'enterprise-freight-docs', storage_path = <org>/<kind>/<uuid>.<ext>
 *
 * Reads go through `signedOrgFileUrl`, which hands out a short-lived R2 link for the new rows and
 * the old Supabase signed URL for the old ones. Deletes go through `removeFreightDoc`, so the R2
 * copy is removed as well.
 *
 * Switch: the same as evidence (`isR2PrivateLinksEnabled` — R2 keys + FILE_LINK_SECRET +
 * SUPABASE_URL). Without it the upload keeps the old Supabase bucket exactly as before.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 6.
 */
import { isR2PrivateLinksEnabled, R2_PRIVATE_BUCKET_ID } from "../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const FREIGHT_DOCS_BUCKET = "enterprise-freight-docs";
export const FREIGHT_DOCS_PURPOSE = "freight-docs";
/** Folder name comes from the purposes table so a key can never drift from the plan. */
export const FREIGHT_DOCS_FOLDER = UPLOAD_PURPOSES[FREIGHT_DOCS_PURPOSE].folder;
/** Same 20 MB cap the bucket had. */
export const FREIGHT_DOCS_MAX_BYTES = UPLOAD_PURPOSES[FREIGHT_DOCS_PURPOSE].maxBytes;
export const FREIGHT_DOCS_MIMES: readonly string[] = UPLOAD_PURPOSES[FREIGHT_DOCS_PURPOSE].mimes;
export const FREIGHT_DOCS_CACHE = "private, no-store";
/** Same 1-hour link the Supabase signed URL gave. */
export const FREIGHT_DOCS_LINK_SECONDS = 3600;

export { R2_PRIVATE_BUCKET_ID };

export function isR2FreightDocsEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env);
}

function safeSegment(value: string | null | undefined, fallback: string): string {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || fallback;
}

function safeExt(fileExt: string | null | undefined): string {
  return (fileExt || "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
}

/** R2 key for a new document: freight-docs/<org>/<kind>/<uuid>.<ext>. */
export function buildFreightDocR2Key(
  organizationId: string | null | undefined,
  kind: string | null | undefined,
  fileExt: string,
): string {
  return `${FREIGHT_DOCS_FOLDER}/${safeSegment(organizationId, "no-org")}/${safeSegment(kind, "other")}/${crypto.randomUUID()}.${safeExt(fileExt)}`;
}

/** Old Supabase path for a new document — unchanged from before the switch. */
export function legacyFreightDocPath(
  organizationId: string,
  kind: string,
  fileExt: string,
  id: string = crypto.randomUUID(),
): string {
  return `${organizationId}/${kind}/${id}.${safeExt(fileExt)}`;
}

/**
 * True when this org_files row points at roam-private. `bucket_id` is the source of truth; the
 * folder prefix covers a row written without the marker.
 */
export function isFreightDocOnR2(
  bucketId: string | null | undefined,
  storagePath: string | null | undefined,
): boolean {
  if (bucketId === R2_PRIVATE_BUCKET_ID) return true;
  return typeof storagePath === "string" && storagePath.startsWith(`${FREIGHT_DOCS_FOLDER}/`);
}

export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

/** Writes a document to roam-private. */
export async function putFreightDoc(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("private", key, bytes, contentType, FREIGHT_DOCS_CACHE);
}

/** Short-lived read link straight to R2 (no bytes through the function). */
export async function signFreightDocUrl(
  key: string,
  expiresIn: number = FREIGHT_DOCS_LINK_SECONDS,
  presign: (key: string, seconds: number) => Promise<string> = (k, seconds) =>
    r2FromEnv().presignDownload("private", k, seconds),
): Promise<string> {
  return await presign(key, expiresIn);
}

export type RemoveR2Objects = (keys: string[], bucket?: "private" | "public") => Promise<void>;

/**
 * Deletes a document wherever it lives. Never throws.
 */
export async function removeFreightDoc(
  supabase: unknown,
  bucketId: string | null | undefined,
  storagePath: string,
  r2Remove?: RemoveR2Objects,
): Promise<{ removed: number; errors: string[] }> {
  const bucket = isFreightDocOnR2(bucketId, storagePath)
    ? R2_PRIVATE_BUCKET_ID
    : bucketId || FREIGHT_DOCS_BUCKET;
  return await removeStoredFiles(supabase, bucket, [storagePath], r2Remove);
}
