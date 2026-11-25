/**
 * In-House desk purchase receipts (Dominion → In-House → place order → receipt photo/PDF).
 *
 * The desk already sends the file to the server as base64 and the server stores it; the app is
 * untouched. When R2 is switched on the file goes to
 * `roam-private/in-house-receipts/<merchant>/<task>-<uuid>.<ext>` and `procurement_tasks.receipt_path`
 * stores a signed `file-link` address (one year) so staff can open the receipt later — the same
 * shape evidence uses. Rows written before the switch keep the bare Supabase path they were given
 * in bucket `in-house-receipts`, which this module still reads and deletes.
 *
 * Switch: the same as evidence (`isR2PrivateLinksEnabled` — R2 keys + FILE_LINK_SECRET +
 * SUPABASE_URL). Without it the route keeps the old Supabase upload exactly as it was.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 4.
 */
import {
  keyFromFileLink,
  R2_PRIVATE_BUCKET_ID,
  signFileLink,
} from "../../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../../_shared/objectStorage/purposes.ts";
import { r2FromEnv } from "../../_shared/objectStorage/r2Client.ts";
import { removeStoredFiles } from "../../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const IN_HOUSE_RECEIPT_BUCKET = "in-house-receipts";
export const IN_HOUSE_RECEIPT_PURPOSE = "in-house-receipts";
/** Same 5 MB cap and photo/PDF types the route already enforced. */
export const IN_HOUSE_RECEIPT_MAX_BYTES = UPLOAD_PURPOSES[IN_HOUSE_RECEIPT_PURPOSE].maxBytes;
export const IN_HOUSE_RECEIPT_MIMES: readonly string[] = UPLOAD_PURPOSES[IN_HOUSE_RECEIPT_PURPOSE].mimes;
export const IN_HOUSE_RECEIPT_CACHE = "private, no-store";

function safeSegment(value: string | null | undefined): string {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function safeExt(fileExt: string | null | undefined): string {
  return (fileExt || "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
}

/** R2 key for a new receipt: in-house-receipts/<merchant>/<task>-<uuid>.<ext>. */
export function buildInHouseReceiptR2Key(
  merchantId: string | null | undefined,
  taskId: string,
  fileExt: string,
): string {
  const merchant = safeSegment(merchantId) || "no-merchant";
  const task = safeSegment(taskId) || "no-task";
  return `${IN_HOUSE_RECEIPT_PURPOSE}/${merchant}/${task}-${crypto.randomUUID()}.${safeExt(fileExt)}`;
}

/** Old Supabase path for a new receipt — unchanged from before the switch. */
export function legacyInHouseReceiptPath(
  taskId: string,
  fileExt: string,
  id: string = crypto.randomUUID(),
): string {
  return `${taskId}/${id}.${safeExt(fileExt)}`;
}

/** Signed file-link address stored in receipt_path, for a receipt that lives in roam-private. */
export async function signInHouseReceiptAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): Promise<string> {
  return await signFileLink({
    key,
    secret: env("FILE_LINK_SECRET") ?? "",
    supabaseUrl: env("SUPABASE_URL") ?? "",
  });
}

export type StoredInHouseReceipt = { storage: "r2" | "supabase"; bucket: string; path: string };

/**
 * Address stored in procurement_tasks.receipt_path → where the bytes live.
 * Handles a signed file-link address (R2), an old Supabase URL, and the bare Supabase path
 * older rows carry.
 */
export function parseInHouseReceiptAddress(
  value: string | null | undefined,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): StoredInHouseReceipt | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const r2Key = keyFromFileLink(raw);
  if (r2Key) return { storage: "r2", bucket: R2_PRIVATE_BUCKET_ID, path: r2Key };

  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (match) return { storage: "supabase", bucket: match[1], path: decodeURIComponent(match[2]) };
    const marker = `${IN_HOUSE_RECEIPT_BUCKET}/`;
    const idx = raw.indexOf(marker);
    if (idx === -1) return null;
    const rest = raw.slice(idx + marker.length).split("?")[0];
    return rest ? { storage: "supabase", bucket: IN_HOUSE_RECEIPT_BUCKET, path: decodeURIComponent(rest) } : null;
  }

  // Bare path, as written before this slice.
  return { storage: "supabase", bucket: IN_HOUSE_RECEIPT_BUCKET, path: decodeURIComponent(raw) };
}

/** Writes a receipt to roam-private. */
export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

export async function putInHouseReceipt(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("private", key, bytes, contentType, IN_HOUSE_RECEIPT_CACHE);
}

/**
 * Deletes receipts wherever they live (roam-private or the old Supabase bucket).
 * Never throws.
 */
export async function removeInHouseReceipts(
  supabase: unknown,
  addresses: string[],
  options: {
    env?: (name: string) => string | undefined;
    r2Remove?: (keys: string[], bucket?: "private" | "public") => Promise<void>;
  } = {},
): Promise<{ removed: number; errors: string[]; skipped: number }> {
  let skipped = 0;
  const r2Keys: string[] = [];
  const byBucket = new Map<string, string[]>();
  for (const address of addresses) {
    const parsed = parseInHouseReceiptAddress(address, options.env);
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
    const res = await removeStoredFiles(supabase, R2_PRIVATE_BUCKET_ID, r2Keys, options.r2Remove);
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
