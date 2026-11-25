/**
 * Explorer place photos (Roam Plug pin evidence, `places.place_evidence.photo_path` and the
 * proposal payload's `photoPath`).
 *
 * The server already receives the photo bytes, so nothing in the app changes. With R2 on the file
 * goes to `roam-private/explorer/<user>/<uuid>.jpg` and the key is stored; the Dominion review
 * queue signs it with a 10-minute R2 link. Rows written before the switch keep their
 * `<place>/<uuid>.jpg` path in `explorer-photos`, which still signs exactly as before.
 *
 * Switch: the shared R2 switch (`isR2PrivateLinksEnabled`). Off → the old bucket upload.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 8.
 */
import { isR2PrivateLinksEnabled, R2_PRIVATE_BUCKET_ID, signFileLink } from "../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const EXPLORER_PHOTO_BUCKET = "explorer-photos";
export const EXPLORER_PHOTO_PURPOSE = "explorer";
export const EXPLORER_PHOTO_FOLDER = UPLOAD_PURPOSES[EXPLORER_PHOTO_PURPOSE].folder;
export const EXPLORER_PHOTO_MAX_BYTES = UPLOAD_PURPOSES[EXPLORER_PHOTO_PURPOSE].maxBytes;
/** The route only ever sends JPEG bytes. */
export const EXPLORER_PHOTO_CONTENT_TYPE = "image/jpeg";
export const EXPLORER_PHOTO_LINK_SECONDS = 600;
const CACHE = "private, no-store";

export { R2_PRIVATE_BUCKET_ID };

export function isR2ExplorerPhotosEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env);
}

/** R2 key for a new photo: explorer/<user>/<uuid>.jpg. */
export function buildExplorerPhotoKey(userId: string | null | undefined, fileExt = "jpg"): string {
  const user = (userId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "no-user";
  const ext = (fileExt || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `${EXPLORER_PHOTO_FOLDER}/${user}/${crypto.randomUUID()}.${ext}`;
}

/** Old Supabase path for a new photo — unchanged from before the switch. */
export function legacyExplorerPhotoPath(
  placeId: string,
  fileExt = "jpg",
  id: string = crypto.randomUUID(),
): string {
  return `${placeId}/${id}.${fileExt}`;
}

/** True when a stored value is one of our R2 keys (old paths start with the place id). */
export function isExplorerPhotoOnR2(storagePath: string | null | undefined): boolean {
  return typeof storagePath === "string" && storagePath.startsWith(`${EXPLORER_PHOTO_FOLDER}/`);
}

export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

export async function putExplorerPhoto(
  key: string,
  bytes: Uint8Array,
  contentType: string = EXPLORER_PHOTO_CONTENT_TYPE,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("private", key, bytes, contentType, CACHE);
}

/** 10-minute read link for the review queue (same lifetime the Supabase signed URL gave). */
export async function signExplorerPhotoUrl(
  key: string,
  expiresIn: number = EXPLORER_PHOTO_LINK_SECONDS,
  presign: (key: string, seconds: number) => Promise<string> = (k, seconds) =>
    r2FromEnv().presignDownload("private", k, seconds),
): Promise<string> {
  return await presign(key, expiresIn);
}

/** Openable address, for callers that store an address rather than a key. */
export async function explorerPhotoAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): Promise<string> {
  return await signFileLink({
    key,
    secret: env("FILE_LINK_SECRET") ?? "",
    supabaseUrl: env("SUPABASE_URL") ?? "",
  });
}

export type RemoveR2Objects = (keys: string[], bucket?: "private" | "public") => Promise<void>;

/** Deletes a photo wherever it lives. Never throws. */
export async function removeExplorerPhotos(
  supabase: unknown,
  paths: string[],
  r2Remove?: RemoveR2Objects,
): Promise<{ removed: number; errors: string[] }> {
  const r2Keys = paths.filter((p) => isExplorerPhotoOnR2(p));
  const oldPaths = paths.filter((p) => !isExplorerPhotoOnR2(p));
  let removed = 0;
  const errors: string[] = [];
  if (r2Keys.length) {
    const res = await removeStoredFiles(supabase, R2_PRIVATE_BUCKET_ID, r2Keys, r2Remove);
    removed += res.removed;
    errors.push(...res.errors);
  }
  if (oldPaths.length) {
    const res = await removeStoredFiles(supabase, EXPLORER_PHOTO_BUCKET, oldPaths);
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, errors };
}
