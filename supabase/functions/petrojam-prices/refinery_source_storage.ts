/**
 * Refinery price source documents (Dominion → Refineries → "Source link or document").
 *
 * The server already receives the document bytes, so nothing in the app changes. With R2 on the
 * file goes to `roam-private/refinery-sources/platform/<slug>/<date>/<name>` (its purpose is
 * platform-scoped) and that key is stored where the old bucket path used to go; the same name and
 * date overwrite the same object, exactly like the old `upsert: true`. Rows written before the
 * switch keep their old path in `refinery-price-sources`.
 *
 * Switch: the shared R2 switch (`isR2PrivateLinksEnabled`). Off → the old bucket upload.
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 8.
 */
import { isR2PrivateLinksEnabled, R2_PRIVATE_BUCKET_ID } from "../_shared/objectStorage/fileLink.ts";
import { UPLOAD_PURPOSES } from "../_shared/objectStorage/purposes.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { removeStoredFiles } from "../_shared/objectStorage/storedFiles.ts";

/** Old Supabase bucket; rows written before the switch still point into it. */
export const REFINERY_SOURCE_BUCKET = "refinery-price-sources";
export const REFINERY_SOURCE_PURPOSE = "refinery-sources";
export const REFINERY_SOURCE_FOLDER = UPLOAD_PURPOSES[REFINERY_SOURCE_PURPOSE].folder;
export const REFINERY_SOURCE_MAX_BYTES = UPLOAD_PURPOSES[REFINERY_SOURCE_PURPOSE].maxBytes;
const CACHE = "private, no-store";

export { R2_PRIVATE_BUCKET_ID };

export function isR2RefinerySourcesEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return isR2PrivateLinksEnabled(env);
}

/** Same file-name clean-up the old path used. */
export function safeRefineryFileName(documentName: string): string {
  const name = (documentName || "").replace(/[^\w.\-]+/g, "_").replace(/^[._-]+/, "");
  return name.slice(0, 120) || "source.pdf";
}

export function refinerySourceContentType(documentName: string): string {
  return documentName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
}

/**
 * R2 key for a document: refinery-sources/platform/<slug>/<date>/<name>.
 * Deterministic on purpose — the same name on the same date replaces the same object.
 */
export function buildRefinerySourceKey(
  slug: string | null | undefined,
  effectiveDate: string | null | undefined,
  documentName: string,
): string {
  const safeSlug = (slug || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "no-refinery";
  const safeDate = (effectiveDate || "").replace(/[^0-9-]/g, "").slice(0, 10) || "no-date";
  return `${REFINERY_SOURCE_FOLDER}/platform/${safeSlug}/${safeDate}/${safeRefineryFileName(documentName)}`;
}

/** Old Supabase path — unchanged from before the switch. */
export function legacyRefinerySourcePath(
  slug: string,
  effectiveDate: string,
  documentName: string,
): string {
  return `${slug}/${effectiveDate}/${(documentName || "").replace(/[^\w.\-]+/g, "_")}`;
}

/** True when a stored value is one of our R2 keys. */
export function isRefinerySourceOnR2(storagePath: string | null | undefined): boolean {
  return typeof storagePath === "string" && storagePath.startsWith(`${REFINERY_SOURCE_FOLDER}/`);
}

export type PutObject = (
  bucket: "private",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) => Promise<void>;

export async function putRefinerySource(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  r2Put: PutObject = (bucket, k, data, type, cache) => r2FromEnv().put(bucket, k, data, type, cache),
): Promise<void> {
  await r2Put("private", key, bytes, contentType, CACHE);
}

export type RemoveR2Objects = (keys: string[], bucket?: "private" | "public") => Promise<void>;

/** Deletes a source document wherever it lives. Never throws. */
export async function removeRefinerySources(
  supabase: unknown,
  paths: string[],
  r2Remove?: RemoveR2Objects,
): Promise<{ removed: number; errors: string[] }> {
  const r2Keys = paths.filter((p) => isRefinerySourceOnR2(p));
  const oldPaths = paths.filter((p) => !isRefinerySourceOnR2(p));
  let removed = 0;
  const errors: string[] = [];
  if (r2Keys.length) {
    const res = await removeStoredFiles(supabase, R2_PRIVATE_BUCKET_ID, r2Keys, r2Remove);
    removed += res.removed;
    errors.push(...res.errors);
  }
  if (oldPaths.length) {
    const res = await removeStoredFiles(supabase, REFINERY_SOURCE_BUCKET, oldPaths);
    removed += res.removed;
    errors.push(...res.errors);
  }
  return { removed, errors };
}
