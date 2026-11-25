/**
 * The three purposes that must virus-scan before a file is kept — courier docs, driver docs and
 * merchant KYC (the plan's `scan: true` rows in purposes.ts).
 *
 * IMPORTANT: production has **no** `MALWARE_SCAN_API_KEY`, and the shared R2 switch
 * (`isR2PrivateLinksEnabled`) is already on there. So these three purposes get their own switch
 * that ALSO requires the scan key. Without the key every upload keeps the old Supabase path and
 * behaviour exactly as it is today — nothing moves until the owner adds a scan key.
 *
 * Fail-closed: with the switch on, `finishUpload` scans the file and deletes it when the scan
 * fails (or when the scanner is not configured), so an upload can never land unscanned.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 7.
 */
import {
  isR2PrivateLinksEnabled,
  R2_PRIVATE_BUCKET_ID,
  signFileLink,
} from "./fileLink.ts";
import { UPLOAD_PURPOSES } from "./purposes.ts";
import { r2FromEnv } from "./r2Client.ts";
import { removeStoredFiles } from "./storedFiles.ts";

export type ScannedPurpose = "courier-docs" | "driver-docs" | "merchant-kyc";

export const SCANNED_PURPOSES: readonly ScannedPurpose[] = ["courier-docs", "driver-docs", "merchant-kyc"];

/** Old Supabase bucket each purpose replaces. */
export const SCANNED_PURPOSE_LEGACY_BUCKET: Record<ScannedPurpose, string> = {
  "courier-docs": "courier-documents",
  "driver-docs": "driver-documents",
  "merchant-kyc": "merchant-documents",
};

export const SCANNED_DOC_CACHE = "private, no-store";
/** Same 1-hour lifetime the Supabase signed URLs gave. */
export const SCANNED_DOC_LINK_SECONDS = 3600;

export { R2_PRIVATE_BUCKET_ID };

export function isScannedPurpose(name: string | null | undefined): name is ScannedPurpose {
  return typeof name === "string" && (SCANNED_PURPOSES as readonly string[]).includes(name);
}

/**
 * The switch for these three purposes: the shared R2 switch AND `MALWARE_SCAN_API_KEY`.
 * `MALWARE_SCAN_FAIL_OPEN=1` deliberately does not count — these files must really be scanned.
 */
export function isScannedR2Enabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env) && !!env("MALWARE_SCAN_API_KEY")?.trim();
}

export function scannedPurposeFolder(purpose: ScannedPurpose): string {
  return UPLOAD_PURPOSES[purpose].folder;
}

export const SCANNED_DOC_MAX_BYTES = UPLOAD_PURPOSES["merchant-kyc"].maxBytes;
export const SCANNED_DOC_MIMES: readonly string[] = UPLOAD_PURPOSES["merchant-kyc"].mimes;

function safeSegment(value: string | null | undefined, fallback: string): string {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || fallback;
}

function safeExt(fileExt: string | null | undefined): string {
  return (fileExt || "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
}

/**
 * R2 key for a new document: <folder>/<scope>/[<label>-]<uuid>.<ext>.
 * Labels are short tags we choose (a document type), never user file names.
 */
export function buildScannedDocKey(input: {
  purpose: ScannedPurpose;
  scopeId: string | null | undefined;
  ext: string;
  label?: string | null;
  uuid?: string;
}): string {
  const folder = scannedPurposeFolder(input.purpose);
  const scope = safeSegment(input.scopeId, "no-owner");
  const label = (input.label || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const id = input.uuid || crypto.randomUUID();
  return `${folder}/${scope}/${label ? `${label}-` : ""}${id}.${safeExt(input.ext)}`;
}

/**
 * True when a stored value is one of our R2 keys for this purpose. Old values start with the
 * owner id (`<merchant>/<docType>-<stamp>.<ext>`, `<user>/docs/<uuid>.<ext>`), never with the
 * folder name, so this is unambiguous.
 */
export function isScannedDocOnR2(purpose: ScannedPurpose, storagePath: string | null | undefined): boolean {
  if (typeof storagePath !== "string") return false;
  return storagePath.startsWith(`${scannedPurposeFolder(purpose)}/`);
}

export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

/** Writes a scanned document to roam-private. */
export async function putScannedDoc(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("private", key, bytes, contentType, SCANNED_DOC_CACHE);
}

/** Long-lived openable address for a scanned document (used where a stored value is an address). */
export async function scannedDocAddress(
  key: string,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): Promise<string> {
  return await signFileLink({
    key,
    secret: env("FILE_LINK_SECRET") ?? "",
    supabaseUrl: env("SUPABASE_URL") ?? "",
  });
}

/** Short-lived read link for a stored key (used where staff sign a key on demand). */
export async function signScannedDocUrl(
  key: string,
  expiresIn: number = SCANNED_DOC_LINK_SECONDS,
  presign: (key: string, seconds: number) => Promise<string> = (k, seconds) =>
    r2FromEnv().presignDownload("private", k, seconds),
): Promise<string> {
  return await presign(key, expiresIn);
}

export type RemoveR2Objects = (keys: string[], bucket?: "private" | "public") => Promise<void>;

/**
 * Deletes a document wherever it lives (roam-private or the old bucket it replaced).
 * Never throws.
 */
export async function removeScannedDoc(
  supabase: unknown,
  purpose: ScannedPurpose,
  storagePath: string,
  r2Remove?: RemoveR2Objects,
): Promise<{ removed: number; errors: string[] }> {
  const bucket = isScannedDocOnR2(purpose, storagePath)
    ? R2_PRIVATE_BUCKET_ID
    : SCANNED_PURPOSE_LEGACY_BUCKET[purpose];
  return await removeStoredFiles(supabase, bucket, [storagePath], r2Remove);
}
