/**
 * Deleting stored files wherever they live: Cloudflare R2 (`roam-private` / `roam-public`) or an
 * old Supabase bucket. One copy so every slice removes the R2 object as well as the row
 * (docs/cloudflare-r2-storage-migration-audit.md — M3).
 */
import { R2_PRIVATE_BUCKET_ID } from "./fileLink.ts";
import { r2FromEnv, type R2BucketKind } from "./r2Client.ts";

/** Stored "bucket" value for a file that lives in roam-public (merchant assets, avatars, logos). */
export const R2_PUBLIC_BUCKET_ID = "r2:public";

export type RemoveObjects = (bucket: string, paths: string[]) => Promise<{ error: { message: string } | null }>;

/** Second argument is the R2 bucket ("private" unless the caller says public). */
export type RemoveR2Objects = (keys: string[], bucket?: R2BucketKind) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Deletes stored files wherever they live: R2 ("r2:private" / "r2:public") or a Supabase bucket.
 * Never throws; returns the error message per failed batch.
 */
export async function removeStoredFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  r2Remove: RemoveR2Objects = (keys, kind = "private") => r2FromEnv().remove(kind, keys),
): Promise<{ removed: number; errors: string[] }> {
  let removed = 0;
  const errors: string[] = [];
  const r2Kind: R2BucketKind | null =
    bucket === R2_PRIVATE_BUCKET_ID ? "private" : bucket === R2_PUBLIC_BUCKET_ID ? "public" : null;
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    try {
      if (r2Kind) {
        await r2Remove(chunk, r2Kind);
      } else {
        const { error } = await supabase.storage.from(bucket).remove(chunk);
        if (error) throw error;
      }
      removed += chunk.length;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    }
  }
  return { removed, errors };
}
