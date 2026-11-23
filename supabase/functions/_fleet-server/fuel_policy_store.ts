/**
 * F-11 / F-18: fuel rules live in fuel.policy_scenarios (one row per rule, company in its own
 * column, RLS on). The server reads and writes them only through these service-role functions.
 * The old KV rows (`fuel_scenario:`) are history and are never read or written again.
 */
import { getServiceClient } from "./service_client.ts";
import type { FuelScenarioRecord } from "./fuel_scenario_scope.ts";

/** A company's rules, exactly as saved (versions[] included). Empty for no company. */
export async function listFuelPoliciesForOrg(orgId: string | null | undefined): Promise<FuelScenarioRecord[]> {
  const org = String(orgId || "").trim();
  if (!org) return [];
  const { data, error } = await getServiceClient().rpc("fuel_policy_list", { p_org: org });
  if (error) throw new Error(`fuel rules read failed: ${error.message}`);
  return (Array.isArray(data) ? data : []) as FuelScenarioRecord[];
}

export class FuelPolicyNotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/**
 * Save one rule for this company. A rule id owned by another company is refused by the
 * database (FUEL_POLICY_NOT_FOUND) and surfaces here as FuelPolicyNotFoundError.
 */
export async function saveFuelPolicy(
  orgId: string,
  body: FuelScenarioRecord,
  actorId: string | null,
): Promise<FuelScenarioRecord> {
  const { data, error } = await getServiceClient().rpc("fuel_policy_save", {
    p_org: orgId,
    p_body: { ...body, organizationId: orgId },
    p_actor: actorId,
  });
  if (error) {
    if (/FUEL_POLICY_NOT_FOUND/.test(String(error.message))) throw new FuelPolicyNotFoundError();
    throw new Error(`fuel rule save failed: ${error.message}`);
  }
  return data as FuelScenarioRecord;
}
