/**
 * Parts request photos (Fleet → Find parts → add part info, "one photo of the part").
 *
 * The route already receives the file and answers with one address per file, so nothing in
 * the app changes: when R2 is switched on the photo goes to
 * `parts-requests/<org>/<uuid>.<ext>` in roam-private and the answer is a signed `file-link`
 * address (the same shape evidence uses). Older rows keep the bare Supabase path they were
 * given in bucket `parts-request-photos`.
 *
 * Switch = the R2 keys + FILE_LINK_SECRET + SUPABASE_URL (fileLink.isR2PrivateLinksEnabled).
 * Without them the route keeps the old Supabase upload exactly as it was.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 1.
 */
import {
  keyFromFileLink,
  R2_PRIVATE_BUCKET_ID,
} from "../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket this replaces; rows written before the switch still point into it. */
export const PARTS_PHOTO_BUCKET = "parts-request-photos";
export const PARTS_PHOTO_PURPOSE = "parts-requests";
export const PARTS_PHOTO_MAX_BYTES = UPLOAD_PURPOSES[PARTS_PHOTO_PURPOSE].maxBytes;
export const PARTS_PHOTO_MIMES: readonly string[] = UPLOAD_PURPOSES[PARTS_PHOTO_PURPOSE].mimes;

/** Org id that is safe to put in a key path (same rule as evidence). */
export function safeOrgFolder(orgId: string | null | undefined): string {
  return (orgId || "").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^[_-]+/, "") || "no-org";
}

/** R2 key for a new photo: parts-requests/<org>/<uuid>.<ext>. */
export function buildPartsPhotoR2Key(orgId: string | null | undefined, fileExt: string): string {
  const ext = fileExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `parts-requests/${safeOrgFolder(orgId)}/${crypto.randomUUID()}.${ext}`;
}

/** Old Supabase path for a new photo — byte-for-byte what the route wrote before the switch. */
export function buildLegacyPartsPhotoPath(
  orgId: string,
  fileName: string,
  id: string = crypto.randomUUID(),
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "photo";
  return `${orgId}/${id}-${safe}`;
}

/** True only for a key that sits in this org's own parts-requests folder. */
export function isPartsPhotoKeyForOrg(key: string, orgId: string): boolean {
  if (!key || key.includes("..") || key.includes("//")) return false;
  return key.startsWith(`parts-requests/${safeOrgFolder(orgId)}/`);
}

export type StoredPartsPhoto = { bucket: string; path: string };

/**
 * Address stored in `parts_sourcing_requests.photo_url` → where the bytes live.
 * Handles a signed file-link address (R2), an old Supabase URL, and the plain
 * Supabase path older rows carry.
 */
export function parsePartsPhotoAddress(value: string | null | undefined): StoredPartsPhoto | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const r2Key = keyFromFileLink(raw);
  if (r2Key) return { bucket: R2_PRIVATE_BUCKET_ID, path: r2Key };

  // Signed / public Supabase address: /storage/v1/object/(sign|public)/<bucket>/<path>
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
    const marker = `${PARTS_PHOTO_BUCKET}/`;
    const idx = raw.indexOf(marker);
    if (idx === -1) return null;
    const rest = raw.slice(idx + marker.length).split("?")[0];
    return rest ? { bucket: PARTS_PHOTO_BUCKET, path: decodeURIComponent(rest) } : null;
  }

  // Bare path, as written by the route before this slice.
  return { bucket: PARTS_PHOTO_BUCKET, path: decodeURIComponent(raw) };
}

/** True when a stored address belongs to this org (old path or new R2 key). */
export function isPartsPhotoAddressForOrg(value: string | null | undefined, orgId: string): boolean {
  const parsed = parsePartsPhotoAddress(value);
  if (!parsed) return false;
  if (parsed.bucket === R2_PRIVATE_BUCKET_ID) return isPartsPhotoKeyForOrg(parsed.path, orgId);
  return parsed.path.startsWith(`${orgId.replace(/^\/+|\/+$/g, "")}/`);
}

/**
 * Deletes parts request photos wherever they live (R2 or the old Supabase bucket).
 * With `orgId` set, anything outside that org is left alone and counted as refused.
 * Never throws.
 */
export async function removePartsRequestPhotos(
  supabase: unknown,
  addresses: string[],
  options: {
    orgId?: string | null;
    r2Remove?: (keys: string[]) => Promise<void>;
  } = {},
): Promise<{ removed: number; refused: number; errors: string[] }> {
  let refused = 0;
  const byBucket = new Map<string, string[]>();
  for (const address of addresses) {
    const parsed = parsePartsPhotoAddress(address);
    if (!parsed) {
      refused++;
      continue;
    }
    if (options.orgId && !isPartsPhotoAddressForOrg(address, options.orgId)) {
      refused++;
      continue;
    }
    const list = byBucket.get(parsed.bucket) ?? [];
    list.push(parsed.path);
    byBucket.set(parsed.bucket, list);
  }

  let removed = 0;
  const errors: string[] = [];
  for (const [bucket, paths] of byBucket) {
    const res = await removeStoredFiles(supabase, bucket, paths, options.r2Remove);
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, refused, errors };
}
