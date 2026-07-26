/**
 * Fleet org payout flag + account keys (Uber-style Layer A destination).
 * Default OFF — journals credit driver until org flag is enabled.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function orgDigitalAccountKey(organizationId: string): string {
  return `org:${organizationId}:digital`;
}

export function orgCashAccountKey(organizationId: string): string {
  return `org:${organizationId}:cash`;
}

export async function isFleetOrgPayoutEnabled(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  // Global kill / force for staging pilots
  const env = Deno.env.get("FLEET_ORG_PAYOUT_ENABLED");
  if (env === "0" || env === "false") return false;
  if (env === "1" || env === "true") return true;

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data, error } = await db
    .from("organizations")
    .select("fleet_org_payout_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    console.warn("[fleetOrgPayout] org lookup failed:", error.message);
    return false;
  }
  return Boolean((data as { fleet_org_payout_enabled?: boolean } | null)?.fleet_org_payout_enabled);
}

/** True when ride is fleet-attributed and org payout flag is on. */
export async function shouldCreditFleetOrg(ride: Record<string, unknown>): Promise<{
  enabled: boolean;
  organizationId: string | null;
}> {
  const organizationId = ride.organization_id
    ? String(ride.organization_id)
    : (ride.fleet_id ? String(ride.fleet_id) : null);
  if (String(ride.attribution_mode ?? "") !== "fleet" && !organizationId) {
    return { enabled: false, organizationId: null };
  }
  if (!organizationId) return { enabled: false, organizationId: null };
  if (String(ride.attribution_mode ?? "") === "independent") {
    return { enabled: false, organizationId };
  }
  const enabled = await isFleetOrgPayoutEnabled(organizationId);
  return { enabled, organizationId };
}
