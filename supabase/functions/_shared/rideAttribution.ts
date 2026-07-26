/**
 * Stamp fleet attribution on ride_requests at assign/complete.
 * Reporting only until organizations.fleet_org_payout_enabled is on.
 * See docs/passenger-rides/MONEY_LEDGER_RULES.md
 */
import { getFleetDriverContext } from "./fleetDriverContext.ts";

export interface RideAttributionPatch {
  fleet_id: string | null;
  organization_id: string | null;
  attribution_mode: "fleet" | "independent";
}

export async function resolveRideAttributionPatch(
  driverUserId: string,
): Promise<RideAttributionPatch> {
  const ctx = await getFleetDriverContext(driverUserId);
  if (ctx.mode === "fleet") {
    const orgId = ctx.organizationId ?? ctx.fleetId;
    return {
      fleet_id: ctx.fleetId ?? orgId,
      organization_id: orgId,
      attribution_mode: "fleet",
    };
  }
  return {
    fleet_id: null,
    organization_id: null,
    attribution_mode: "independent",
  };
}
