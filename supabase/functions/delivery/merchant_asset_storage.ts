/**
 * Merchant storefront images (logo, cover, menu-item photos) → roam-public + media.roamfleet.co.
 *
 * The upload route already receives the file and answers with one address (`publicUrl`), so the
 * apps do not change: when R2 is switched on the image goes to
 * `merchant/<merchant>/<folder>/<content-hash>.<ext>` in roam-public and the answer is the
 * `media.roamfleet.co` address with a one-year immutable cache header. Rows written before the
 * switch keep the full Supabase public URL they stored, so menus and profile pictures in the
 * Rush apps keep showing; nothing rewrites a stored address.
 *
 * Switch: the same secrets as evidence (`isR2PrivateLinksEnabled`) **plus**
 * `R2_PUBLIC_BASE_URL`, because a public file is useless without its media address. Without them
 * the route keeps the old Supabase upload exactly as it was.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 3.
 */
import { isR2PrivateLinksEnabled } from "../_shared/objectStorage/fileLink.ts";
import { publicMediaUrl } from "../_shared/objectStorage/index.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { assertSafeKey, r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { extForMime } from "../_shared/objectStorage/contentCheck.ts";
import { sha256Hex } from "../_shared/objectStorage/sigv4.ts";
import { R2_PUBLIC_BUCKET_ID, removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const MERCHANT_ASSET_BUCKET = "merchant-assets";
export const MERCHANT_ASSET_PURPOSE = "merchant-assets";
/** Same 5 MB cap and image types the old bucket had. */
export const MERCHANT_ASSET_MAX_BYTES = UPLOAD_PURPOSES[MERCHANT_ASSET_PURPOSE].maxBytes;
export const MERCHANT_ASSET_MIMES: readonly string[] = UPLOAD_PURPOSES[MERCHANT_ASSET_PURPOSE].mimes;
/** Public files are immutable: a changed image gets a new key (content hash), so nothing is cached stale. */
export const MERCHANT_ASSET_CACHE = "public, max-age=31536000, immutable";

export { R2_PUBLIC_BUCKET_ID };

/** True when new public assets go to R2: the evidence switch plus the media base address. */
export function isR2PublicAssetsEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env) && !!env("R2_PUBLIC_BASE_URL")?.trim();
}

function safeSegment(value: string | null | undefined): string {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

/**
 * Who the file belongs to: the merchant the caller acts for (owner or team member), else the
 * signed-in user. Platform staff (in-house desk) uploads keep their own folder, as they do today.
 */
export function merchantAssetScope(merchantId: string | null | undefined, userId: string): string {
  const raw = (merchantId || "").trim() || (userId || "").trim();
  return safeSegment(raw) || "unknown";
}

/** Folder name from the app, unchanged from before the switch. */
export function merchantAssetFolder(folder: string | null | undefined): string {
  return (folder || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "images";
}

export function merchantAssetPrefix(scopeId: string, folder: string): string {
  return `merchant/${safeSegment(scopeId) || "unknown"}/${merchantAssetFolder(folder)}/`;
}

/**
 * R2 key for a new image: merchant/<scope>/<folder>/<sha256 first 16>.<ext>.
 * Same picture → same key (no duplicate copies); changed picture → new key and a new address.
 */
export async function buildMerchantAssetKey(input: {
  scopeId: string;
  folder: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const hash = (await sha256Hex(input.bytes)).slice(0, 16);
  return `${merchantAssetPrefix(input.scopeId, input.folder)}${hash}.${extForMime(input.contentType)}`;
}

/** media.roamfleet.co address for a roam-public key. Throws only when the base is not set. */
export function merchantAssetAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): string {
  const url = publicMediaUrl(key, env);
  if (!url) throw new Error("R2_PUBLIC_BASE_URL not set");
  return url;
}

export type PutObject = (
  bucket: "public",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

/** Writes the image to roam-public. */
export async function putMerchantAsset(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("public", key, bytes, contentType, MERCHANT_ASSET_CACHE);
}

export type StoredMerchantAsset = { storage: "r2" | "supabase"; bucket: string; path: string };

/**
 * Address stored in a merchant row → where the bytes live.
 * Handles a media.roamfleet.co address (R2), an old Supabase public URL, and a bare
 * `merchant-assets` path (what the old route returned as `path`).
 */
export function parseMerchantAssetAddress(
  value: string | null | undefined,
  publicBase: string | null | undefined = Deno.env.get("R2_PUBLIC_BASE_URL"),
): StoredMerchantAsset | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const base = publicBase?.trim().replace(/\/+$/, "") ?? "";
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

  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!match) return null;
    return { storage: "supabase", bucket: match[1], path: decodeURIComponent(match[2]) };
  }

  // Bare path, as the old route returned in `path` (and as some rows may store).
  return { storage: "supabase", bucket: MERCHANT_ASSET_BUCKET, path: decodeURIComponent(raw) };
}

/**
 * Deletes merchant assets wherever they live (roam-public or the old Supabase bucket).
 * Never throws.
 */
export async function removeMerchantAssets(
  supabase: unknown,
  addresses: string[],
  options: {
    publicBase?: string | null;
    r2Remove?: (keys: string[], bucket?: "private" | "public") => Promise<void>;
  } = {},
): Promise<{ removed: number; errors: string[]; skipped: number }> {
  let skipped = 0;
  const r2Keys: string[] = [];
  const byBucket = new Map<string, string[]>();
  for (const address of addresses) {
    const parsed = parseMerchantAssetAddress(address, options.publicBase);
    if (!parsed) {
      skipped++;
      continue;
    }
    if (parsed.storage === "r2") {
      r2Keys.push(parsed.path);
      continue;
    }
    const list = byBucket.get(parsed.bucket) ?? [];
    list.push(parsed.path);
    byBucket.set(parsed.bucket, list);
  }

  let removed = 0;
  const errors: string[] = [];
  if (r2Keys.length) {
    const res = await removeStoredFiles(supabase, R2_PUBLIC_BUCKET_ID, r2Keys, options.r2Remove);
    removed += res.removed;
    errors.push(...res.errors);
  }
  for (const [bucket, paths] of byBucket) {
    const res = await removeStoredFiles(supabase, bucket, paths);
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, errors, skipped };
}
