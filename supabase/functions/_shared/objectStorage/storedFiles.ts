/**
 * Deleting stored files wherever they live: Cloudflare R2 (`"r2:private"`) or an old
 * Supabase bucket. One copy so every slice removes the R2 object as well as the row
 * (docs/cloudflare-r2-storage-migration-audit.md — M3).
 */
import { R2_PRIVATE_BUCKET_ID } from "./fileLink.ts";
import { r2FromEnv } from "./r2Client.ts";

export type RemoveObjects = (bucket: string, paths: string[]) => Promise<{ error: { message: string } | null }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Deletes stored files wherever they live: R2 ("r2:private") or a Supabase bucket.
 * Never throws; returns the error message per failed batch.
 */
export async function removeStoredFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  r2Remove: (keys: string[]) => Promise<void> = (keys) => r2FromEnv().remove("private", keys),
): Promise<{ removed: number; errors: string[] }> {
  let removed = 0;
  const errors: string[] = [];
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    try {
      if (bucket === R2_PRIVATE_BUCKET_ID) {
        await r2Remove(chunk);
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
