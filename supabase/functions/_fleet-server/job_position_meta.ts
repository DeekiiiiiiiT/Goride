/**
 * The job fields that decide its places ("Where on the car"): one read shared by Find parts, Ask Roam and Plan it,
 * so the three never drift apart (code review #10).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type JobPositionMeta = {
  code: string | null;
  position_aware: boolean | null;
  position_scheme: string | null;
};

export async function loadJobPositionMeta(
  supabase: SupabaseClient,
  jobId: string,
): Promise<JobPositionMeta | null> {
  const { data, error } = await supabase
    .from("maintenance_service_categories")
    .select("code, position_aware, position_scheme")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as JobPositionMeta | null) ?? null;
}
