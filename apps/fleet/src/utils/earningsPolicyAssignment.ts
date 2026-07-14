import type { EarningsPolicy, EarningsPolicyVersion } from '../types/earningsPolicy';
import { normalizePolicyVersions } from './earningsPolicyVersion';

export type PolicyDriver = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedVehicleId?: string;
};

/** Unique drivers listed on any version assignment of this policy. */
export function driversForPolicy(policy: EarningsPolicy, drivers: PolicyDriver[]): PolicyDriver[] {
  const n = normalizePolicyVersions(policy);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const a of v.assignments || []) ids.add(a.driverId);
  }
  return drivers.filter((d) => ids.has(d.id));
}

/** Count of unique drivers on this policy's version assignments. */
export function driverCountOnPolicy(policy: EarningsPolicy): number {
  const n = normalizePolicyVersions(policy);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const a of v.assignments || []) ids.add(a.driverId);
  }
  return ids.size;
}

/** Drivers listed on a specific version (via assignments; pass normalized version). */
export function driversForVersion(
  version: EarningsPolicyVersion,
  drivers: PolicyDriver[],
): PolicyDriver[] {
  const ids = new Set((version.assignments || []).map((a) => a.driverId));
  return drivers.filter((d) => ids.has(d.id));
}
