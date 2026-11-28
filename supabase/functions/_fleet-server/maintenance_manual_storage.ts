/**
 * Step 3 — where a manual's file lives: the PRIVATE R2 bucket, never an edge function.
 *
 * The upload never passes through here: the route hands the app a one-time PUT link and the bytes go straight to
 * R2 (the same key and the same R2 client the evidence files use). This module only builds keys, signs links and
 * reads the file back when the worker needs a page.
 */
import {
  isR2PrivateLinksEnabled,
  signFileLink,
} from "../_shared/objectStorage/fileLink.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { sha256Hex } from "../_shared/objectStorage/sigv4.ts";

export const MANUAL_BUCKET = "private" as const;
export const MANUAL_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** Long enough for a slow phone on mobile data, short enough to be a one-time link. */
export const MANUAL_UPLOAD_LINK_SECONDS = 600;
export const MANUAL_PAGE_LINK_SECONDS = 15 * 60;

export function manualFileKey(manualId: string): string {
  return `maintenance-manuals/${manualId}.pdf`;
}

/** The cached one-page PDF the screen draws (and the page-link route reads). */
export function manualPagePdfKey(manualId: string, pageNo: number): string {
  return `maintenance-manuals/${manualId}/page-${pageNo}.pdf`;
}

/** R2 and the file link both need their keys; without them an upload must not pretend it worked. */
export function isManualStorageEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env);
}

export function manualStorageOffMessage(): string {
  return "File storage is switched off. Please try again later.";
}

/** The one-time PUT link the app uploads to (same Content-Type header). */
export async function presignManualUpload(manualId: string): Promise<string> {
  return await r2FromEnv().presignUpload(
    MANUAL_BUCKET,
    manualFileKey(manualId),
    "application/pdf",
    MANUAL_UPLOAD_LINK_SECONDS,
  );
}

export async function readManualFile(key: string): Promise<Uint8Array> {
  return await r2FromEnv().read(MANUAL_BUCKET, key);
}

export async function headManualFile(key: string): Promise<{ size: number; contentType: string | null } | null> {
  return await r2FromEnv().head(MANUAL_BUCKET, key);
}

export async function putManualPage(key: string, bytes: Uint8Array): Promise<void> {
  await r2FromEnv().put(MANUAL_BUCKET, key, bytes, "application/pdf", "private, no-store");
}

export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  return await sha256Hex(bytes);
}

/** A short-lived link to a stored page, signed the way every other private file link in the app is signed. */
export async function manualPageLink(
  manualId: string,
  pageNo: number,
  opts: {
    secret?: string;
    supabaseUrl?: string;
    seconds?: number;
  } = {},
): Promise<string> {
  const secret = (opts.secret ?? Deno.env.get("FILE_LINK_SECRET") ?? "").trim();
  const supabaseUrl = (opts.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!secret || !supabaseUrl) {
    throw new Error("File links are switched off: FILE_LINK_SECRET or SUPABASE_URL is missing.");
  }
  return await signFileLink({
    key: manualPagePdfKey(manualId, pageNo),
    secret,
    supabaseUrl,
    seconds: opts.seconds ?? MANUAL_PAGE_LINK_SECONDS,
  });
}
