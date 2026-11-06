import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const FLAG_NAME = "maintenance_master_governance";

export async function isMaintenanceMasterGovernanceEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", FLAG_NAME)
    .maybeSingle();
  return data?.enabled === true;
}
