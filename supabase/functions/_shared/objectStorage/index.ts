/**
 * Object storage (Cloudflare R2). The only entry point app/server code should use.
 * Plan: docs/cloudflare-r2-storage-migration-audit.md
 */
import { assertSafeKey, r2ConfigFromEnv, r2FromEnv } from "./r2Client.ts";
import type { FlowDeps } from "./uploadFlow.ts";

export { assertSafeKey, R2_BUCKETS, R2Client, r2ConfigFromEnv, r2FromEnv } from "./r2Client.ts";
export type { R2BucketKind, R2Config } from "./r2Client.ts";
export { getPurpose, UPLOAD_PURPOSES } from "./purposes.ts";
export type { ScopeKind, UploadPurpose, UploadPurposeName } from "./purposes.ts";
export {
  deleteStoredFile,
  downloadLink,
  finishUpload,
  startUpload,
  StorageFlowError,
} from "./uploadFlow.ts";
export type { FinishedUpload, FlowDeps, ObjectStore, StartUploadResult } from "./uploadFlow.ts";
export {
  FILE_LINK_FUNCTION,
  FILE_LINK_SECONDS,
  keyFromFileLink,
  R2_PRIVATE_BUCKET_ID,
  signFileLink,
  verifyFileLink,
} from "./fileLink.ts";
export type { FileLinkCheck } from "./fileLink.ts";

/** Live dependencies from function secrets. */
export function storageDepsFromEnv(): FlowDeps {
  return { store: r2FromEnv(), ticketSecret: r2ConfigFromEnv().secretAccessKey };
}

/**
 * media.roamfleet.co address for a roam-public key. Needs only R2_PUBLIC_BASE_URL,
 * so read-only routes work without the R2 keys. Returns null when key or base is missing.
 */
export function publicMediaUrl(
  key: string | null | undefined,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): string | null {
  const k = key?.trim();
  const base = env("R2_PUBLIC_BASE_URL")?.trim().replace(/\/+$/, "");
  if (!k || !base) return null;
  try {
    assertSafeKey(k);
  } catch {
    return null;
  }
  return `${base}/${k.split("/").map(encodeURIComponent).join("/")}`;
}
