/**
 * Parts import source files (Dominion → Parts database → Import, `part_import_batch.storage_path`).
 *
 * The app already POSTs the CSV to the server (`/admin/parts-import/batches/:id/source`), so the
 * app does not change. With R2 on the bytes go to
 * `roam-private/parts-imports/platform/<batch>/source.csv` and the row stores that key. The two
 * readers — the check job (`runImportCheck`) and the staff download route — read that key.
 *
 * M6 (docs/cloudflare-r2-storage-migration-audit.md): the old Supabase bucket is **not read any
 * more**. M4 copied every batch to R2 and M5 rewrote every `storage_path`; an old address left in
 * a row has no file behind it, so the readers answer "Upload the CSV first" / "Download failed".
 * Deletes still route old paths to the old bucket until it is dropped in M7.
 *
 * Switch: the same as evidence (`isR2PrivateLinksEnabled` — R2 keys + FILE_LINK_SECRET +
 * SUPABASE_URL). Without it the upload route keeps the old Supabase path exactly as it was.
 */
import { isR2PrivateLinksEnabled } from "../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { assertSafeKey, r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const PARTS_IMPORT_BUCKET = "parts-imports";
export const PARTS_IMPORT_PURPOSE = "parts-imports";
/** Same 5 MB cap as the old bucket and the route's own check. */
export const PARTS_IMPORT_MAX_BYTES = UPLOAD_PURPOSES[PARTS_IMPORT_PURPOSE].maxBytes;
export const PARTS_IMPORT_CONTENT_TYPE = "text/csv; charset=utf-8";
export const PARTS_IMPORT_CACHE = "private, no-store";

export { isR2PrivateLinksEnabled };

/** True when a stored value is an R2 key rather than an old Supabase path. */
export function isPartsImportR2Key(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(`${PARTS_IMPORT_PURPOSE}/`);
}

/** R2 key for a batch's source file: parts-imports/platform/<batch>/source.csv. */
export function buildPartsImportR2Key(batchId: string): string {
  const safe = (batchId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("batch id required");
  return `${PARTS_IMPORT_PURPOSE}/platform/${safe}/source.csv`;
}

/** Old Supabase path for a batch's source file — unchanged from before the switch. */
export function legacyPartsImportPath(batchId: string): string {
  return `${batchId}/source.csv`;
}

/** Address stored in part_import_batch.storage_path → where the bytes live. */
export function parsePartsImportAddress(
  value: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  if (isPartsImportR2Key(raw)) {
    try {
      assertSafeKey(raw);
    } catch {
      return null;
    }
    return { bucket: "r2:private", path: raw };
  }

  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
    const marker = `${PARTS_IMPORT_BUCKET}/`;
    const idx = raw.indexOf(marker);
    if (idx === -1) return null;
    const rest = raw.slice(idx + marker.length).split("?")[0];
    return rest ? { bucket: PARTS_IMPORT_BUCKET, path: decodeURIComponent(rest) } : null;
  }

  return { bucket: PARTS_IMPORT_BUCKET, path: decodeURIComponent(raw) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
export type ReadObject = (key: string) => Promise<Uint8Array>;

/**
 * Bytes of a batch's source file, from R2. Returns null when it is not there (caller shows
 * "Upload the CSV first" / "Download failed").
 *
 * M6: the old `parts-imports` Supabase bucket is no longer read. Every batch was copied to R2
 * and its `storage_path` rewritten in M5; a leftover old path means there is no file any more,
 * so it returns null instead of falling back to Supabase.
 */
export async function readPartsImportSource(
  _supabase: SupabaseClient,
  storagePath: string | null | undefined,
  r2Read: ReadObject = (key) => r2FromEnv().read("private", key),
): Promise<Uint8Array | null> {
  const address = parsePartsImportAddress(storagePath);
  if (!address || address.bucket !== "r2:private") return null;
  try {
    return await r2Read(address.path);
  } catch (e) {
    console.warn(
      "[parts_import_storage] read failed:",
      e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e),
    );
    return null;
  }
}

/** Writes the bytes to R2 and returns the key to save in storage_path. Overwrites on re-upload. */
export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

export async function putPartsImportSource(
  batchId: string,
  bytes: Uint8Array,
  r2Put: PutObject = (bucket, key, data, contentType, cacheControl) =>
    r2FromEnv().put(bucket, key, data, contentType, cacheControl),
): Promise<string> {
  const key = buildPartsImportR2Key(batchId);
  await r2Put("private", key, bytes, PARTS_IMPORT_CONTENT_TYPE, PARTS_IMPORT_CACHE);
  return key;
}

/**
 * Deletes parts import source files wherever they live (R2 or the old Supabase bucket).
 * Never throws.
 */
export async function removePartsImportSources(
  supabase: SupabaseClient,
  addresses: string[],
  r2Remove?: (keys: string[]) => Promise<void>,
): Promise<{ removed: number; errors: string[]; skipped: number }> {
  let skipped = 0;
  const byBucket = new Map<string, string[]>();
  for (const address of addresses) {
    const parsed = parsePartsImportAddress(address);
    if (!parsed) {
      skipped++;
      continue;
    }
    const list = byBucket.get(parsed.bucket) ?? [];
    list.push(parsed.path);
    byBucket.set(parsed.bucket, list);
  }

  let removed = 0;
  const errors: string[] = [];
  for (const [bucket, paths] of byBucket) {
    const res = await removeStoredFiles(supabase, bucket, paths, r2Remove);
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, errors, skipped };
}
