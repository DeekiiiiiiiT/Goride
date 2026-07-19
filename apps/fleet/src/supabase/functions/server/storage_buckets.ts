/**
 * Single source of truth for Fleet Storage bucket create/update.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const BUCKET_CONFIG = {
  "make-37f42386-docs": { public: false, fileSizeLimit: 10_485_760 },
  "make-37f42386-vehicles": { public: false, fileSizeLimit: 10_485_760 },
  "ephemeral-evidence": { public: false, fileSizeLimit: 5_242_880 },
} as const;

export type FleetBucketName = keyof typeof BUCKET_CONFIG;

export async function ensureBucket(
  supabase: SupabaseClient,
  name: FleetBucketName,
): Promise<void> {
  const cfg = BUCKET_CONFIG[name];
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === name);
  if (!exists) {
    await supabase.storage.createBucket(name, {
      public: cfg.public,
      fileSizeLimit: cfg.fileSizeLimit,
    });
    return;
  }
  await supabase.storage.updateBucket(name, {
    public: cfg.public,
    fileSizeLimit: cfg.fileSizeLimit,
  });
}
