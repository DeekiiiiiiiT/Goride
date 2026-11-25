/**
 * Customer pictures: avatars (public) and issue photos (private).
 *
 * Both routes already receive the file and answer with one address per file, so the customer app
 * does not change:
 *  - avatar      → `roam-public/avatars/<user>/<content-hash>.<ext>`, answered as the
 *                  `media.roamfleet.co` address (`customers.avatar_url`), cached for a year.
 *  - issue photo → `roam-private/customer-issues/<user>/<content-hash>.<ext>`, answered as a
 *                  signed `file-link` address in both `path` and `signedUrl`, so the value the app
 *                  stores in `customer_order_issues.photo_url` stays openable for support staff.
 *
 * Rows written before the switch keep the old Supabase values (`customer-avatars` public URL /
 * `customer-issue-photos` bare path), which this module still reads and deletes.
 *
 * Switches: avatar = the evidence switch plus `R2_PUBLIC_BASE_URL` (a public file needs its media
 * address); issue photo = the evidence switch (it hands out a private link). Without them each
 * route keeps its old Supabase upload exactly as it was.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 5.
 */
import { isR2PrivateLinksEnabled, keyFromFileLink, R2_PRIVATE_BUCKET_ID, signFileLink } from "../_shared/objectStorage/fileLink.ts";
import { publicMediaUrl } from "../_shared/objectStorage/index.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { assertSafeKey, r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { extForMime } from "../_shared/objectStorage/contentCheck.ts";
import { sha256Hex } from "../_shared/objectStorage/sigv4.ts";
import { R2_PUBLIC_BUCKET_ID, removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase buckets; rows written before the switch still point into them. */
export const AVATAR_BUCKET = "customer-avatars";
export const ISSUE_PHOTO_BUCKET = "customer-issue-photos";
export const AVATAR_PURPOSE = "customer-avatars";
export const ISSUE_PHOTO_PURPOSE = "customer-issues";
/** Folder names come from the purposes table so a key can never drift from the plan. */
export const AVATAR_FOLDER = UPLOAD_PURPOSES[AVATAR_PURPOSE].folder;
export const ISSUE_PHOTO_FOLDER = UPLOAD_PURPOSES[ISSUE_PHOTO_PURPOSE].folder;
/** Same 2 MB cap and image types the routes already enforced (both purposes). */
export const CUSTOMER_PHOTO_MAX_BYTES = UPLOAD_PURPOSES[AVATAR_PURPOSE].maxBytes;
export const CUSTOMER_PHOTO_MIMES: readonly string[] = UPLOAD_PURPOSES[AVATAR_PURPOSE].mimes;
/** Public avatars are immutable; a changed picture gets a new content-hashed key. */
export const AVATAR_CACHE = "public, max-age=31536000, immutable";
export const ISSUE_PHOTO_CACHE = "private, no-store";

export { R2_PRIVATE_BUCKET_ID, R2_PUBLIC_BUCKET_ID };

/** Avatars need a media address; issue photos need a private link. */
export function isR2AvatarEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env) && !!env("R2_PUBLIC_BASE_URL")?.trim();
}

export const isR2IssuePhotoEnabled = isR2PrivateLinksEnabled;

function safeSegment(value: string | null | undefined): string {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

async function contentName(bytes: Uint8Array, contentType: string): Promise<string> {
  const hash = (await sha256Hex(bytes)).slice(0, 16);
  return `${hash}.${extForMime(contentType)}`;
}

/** R2 key for a new avatar: avatars/<user>/<hash>.<ext>. */
export async function buildAvatarKey(userId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  return `${AVATAR_FOLDER}/${safeSegment(userId) || "no-user"}/${await contentName(bytes, contentType)}`;
}

/** R2 key for a new issue photo: customer-issues/<user>/<hash>.<ext>. */
export async function buildIssuePhotoKey(userId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  return `${ISSUE_PHOTO_FOLDER}/${safeSegment(userId) || "no-user"}/${await contentName(bytes, contentType)}`;
}

/** Old Supabase paths — unchanged from before the switch. */
export function legacyAvatarPath(userId: string, fileExt: string, id: string = crypto.randomUUID()): string {
  return `${userId}/avatars/${id}.${fileExt}`;
}

export function legacyIssuePhotoPath(userId: string, fileExt: string, id: string = crypto.randomUUID()): string {
  return `${userId}/issues/${id}.${fileExt}`;
}

/** media.roamfleet.co address for a roam-public avatar key. */
export function avatarAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): string {
  const url = publicMediaUrl(key, env);
  if (!url) throw new Error("R2_PUBLIC_BASE_URL not set");
  return url;
}

/** Signed file-link address for a roam-private issue photo. */
export async function issuePhotoAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): Promise<string> {
  return await signFileLink({
    key,
    secret: env("FILE_LINK_SECRET") ?? "",
    supabaseUrl: env("SUPABASE_URL") ?? "",
  });
}

export type PutObject = (
  bucket: "public" | "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

const defaultPut: PutObject = (bucket, key, bytes, contentType, cacheControl) =>
  r2FromEnv().put(bucket, key, bytes, contentType, cacheControl);

export async function putAvatar(key: string, bytes: Uint8Array, contentType: string, r2Put: PutObject = defaultPut): Promise<void> {
  await r2Put("public", key, bytes, contentType, AVATAR_CACHE);
}

export async function putIssuePhoto(key: string, bytes: Uint8Array, contentType: string, r2Put: PutObject = defaultPut): Promise<void> {
  await r2Put("private", key, bytes, contentType, ISSUE_PHOTO_CACHE);
}

export type StoredCustomerPhoto = { storage: "r2" | "supabase"; bucket: string; path: string };

function parseSupabaseAddress(
  raw: string,
  bucket: string,
): StoredCustomerPhoto {
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (match) return { storage: "supabase", bucket: match[1], path: decodeURIComponent(match[2]) };
    const marker = `${bucket}/`;
    const idx = raw.indexOf(marker);
    if (idx === -1) return { storage: "supabase", bucket, path: decodeURIComponent(raw) };
    const rest = raw.slice(idx + marker.length).split("?")[0];
    return { storage: "supabase", bucket, path: decodeURIComponent(rest) };
  }
  return { storage: "supabase", bucket, path: decodeURIComponent(raw) };
}

/** Avatar address stored in customers.avatar_url / avatar_path → where the bytes live. */
export function parseAvatarAddress(
  value: string | null | undefined,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): StoredCustomerPhoto | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const base = env("R2_PUBLIC_BASE_URL")?.trim().replace(/\/+$/, "") ?? "";
  if (base && raw.startsWith(`${base}/`)) {
    const key = raw.slice(base.length + 1).split("?")[0].split("/").map(decodeURIComponent).join("/");
    if (!key) return null;
    try {
      assertSafeKey(key);
    } catch {
      return null;
    }
    return { storage: "r2", bucket: R2_PUBLIC_BUCKET_ID, path: key };
  }
  // A bare key (customer.avatar_path for rows written after the switch). Old paths always start
  // with the user id, never with the folder name, so this is unambiguous.
  if (raw.startsWith(`${AVATAR_FOLDER}/`)) {
    try {
      assertSafeKey(raw);
    } catch {
      return null;
    }
    return { storage: "r2", bucket: R2_PUBLIC_BUCKET_ID, path: raw };
  }
  return parseSupabaseAddress(raw, AVATAR_BUCKET);
}

/** Issue-photo address stored in customer_order_issues.photo_url → where the bytes live. */
export function parseIssuePhotoAddress(
  value: string | null | undefined,
): StoredCustomerPhoto | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const r2Key = keyFromFileLink(raw);
  if (r2Key) return { storage: "r2", bucket: R2_PRIVATE_BUCKET_ID, path: r2Key };
  // A bare key, same rule as avatars (old paths start with the user id, not the folder name).
  if (raw.startsWith(`${ISSUE_PHOTO_FOLDER}/`)) {
    try {
      assertSafeKey(raw);
    } catch {
      return null;
    }
    return { storage: "r2", bucket: R2_PRIVATE_BUCKET_ID, path: raw };
  }
  return parseSupabaseAddress(raw, ISSUE_PHOTO_BUCKET);
}

function inUserFolder(parsed: StoredCustomerPhoto | null, userId: string, folder: string): boolean {
  if (!parsed) return false;
  const user = safeSegment(userId);
  if (!user) return false;
  const prefix = parsed.storage === "r2" ? `${folder}/${user}/` : `${userId}/`;
  return parsed.path.startsWith(prefix);
}

/** True only for an avatar that belongs to this user (old path or new key). */
export function isOwnAvatar(value: string | null | undefined, userId: string, env?: (name: string) => string | undefined): boolean {
  return inUserFolder(parseAvatarAddress(value, env), userId, AVATAR_FOLDER);
}

/** True only for an issue photo that belongs to this user (old path or new key). */
export function isOwnIssuePhoto(value: string | null | undefined, userId: string): boolean {
  return inUserFolder(parseIssuePhotoAddress(value), userId, ISSUE_PHOTO_FOLDER);
}

async function removeParsed(
  supabase: unknown,
  parsedList: StoredCustomerPhoto[],
  r2Remove?: (keys: string[], bucket?: "private" | "public") => Promise<void>,
): Promise<{ removed: number; errors: string[] }> {
  const byBucket = new Map<string, StoredCustomerPhoto[]>();
  for (const parsed of parsedList) {
    const list = byBucket.get(parsed.bucket) ?? [];
    list.push(parsed);
    byBucket.set(parsed.bucket, list);
  }

  let removed = 0;
  const errors: string[] = [];
  for (const [bucket, entries] of byBucket) {
    const r2 = entries[0].storage === "r2";
    const res = await removeStoredFiles(
      supabase,
      bucket,
      entries.map((e) => e.path),
      r2 ? r2Remove : undefined,
    );
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, errors };
}

/**
 * Deletes avatars wherever they live (roam-public or the old bucket). With `userId` set,
 * anything outside that user's folder is left alone and counted as refused. Never throws.
 */
export async function removeAvatars(
  supabase: unknown,
  addresses: string[],
  options: {
    userId?: string | null;
    env?: (name: string) => string | undefined;
    r2Remove?: (keys: string[], bucket?: "private" | "public") => Promise<void>;
  } = {},
): Promise<{ removed: number; errors: string[]; refused: number }> {
  const parsed: StoredCustomerPhoto[] = [];
  let refused = 0;
  for (const address of addresses) {
    const one = parseAvatarAddress(address, options.env);
    if (!one) {
      refused++;
      continue;
    }
    if (options.userId && !inUserFolder(one, options.userId, AVATAR_FOLDER)) {
      refused++;
      continue;
    }
    parsed.push(one);
  }
  const res = await removeParsed(supabase, parsed, options.r2Remove);
  return { ...res, refused };
}

/**
 * Deletes issue photos wherever they live (roam-private or the old bucket). With `userId` set,
 * anything outside that user's folder is left alone and counted as refused. Never throws.
 */
export async function removeIssuePhotos(
  supabase: unknown,
  addresses: string[],
  options: {
    userId?: string | null;
    r2Remove?: (keys: string[], bucket?: "private" | "public") => Promise<void>;
  } = {},
): Promise<{ removed: number; errors: string[]; refused: number }> {
  const parsed: StoredCustomerPhoto[] = [];
  let refused = 0;
  for (const address of addresses) {
    const one = parseIssuePhotoAddress(address);
    if (!one) {
      refused++;
      continue;
    }
    if (options.userId && !inUserFolder(one, options.userId, ISSUE_PHOTO_FOLDER)) {
      refused++;
      continue;
    }
    parsed.push(one);
  }
  const res = await removeParsed(supabase, parsed, options.r2Remove);
  return { ...res, refused };
}
