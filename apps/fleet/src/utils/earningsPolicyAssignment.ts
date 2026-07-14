import type { EarningsPolicy } from '../types/earningsPolicy';
import { normalizePolicyVersions } from './earningsPolicyVersion';

export type PolicyDriver = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedVehicleId?: string;
};

/** Unique drivers listed on any version of this policy (Schedule membership). */
export function driversForPolicy(policy: EarningsPolicy, drivers: PolicyDriver[]): PolicyDriver[] {
  const n = normalizePolicyVersions(policy);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const id of v.driverIds || []) ids.add(id);
  }
  return drivers.filter((d) => ids.has(d.id));
}

/** Count of unique drivers on this policy's versions. */
export function driverCountOnPolicy(policy: EarningsPolicy): number {
  const n = normalizePolicyVersions(policy);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const id of v.driverIds || []) ids.add(id);
  }
  return ids.size;
}

/** Drivers listed on a specific version. */
export function driversForVersion(
  version: { driverIds?: string[] },
  drivers: PolicyDriver[],
): PolicyDriver[] {
  const ids = new Set(version.driverIds || []);
  return drivers.filter((d) => ids.has(d.id));
}
