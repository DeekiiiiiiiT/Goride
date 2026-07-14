/**
 * Guards Earnings Policy delete: block when drivers are on schedule versions,
 * policy is default, or it's the last policy.
 * Simpler than fuel: no finalized report check needed.
 */

import type { EarningsPolicy } from '../types/earningsPolicy';
import { driversForPolicy } from './earningsPolicyAssignment';

export type PolicyDriverRef = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};

export type EarningsPolicyDeleteGuardResult = {
  canHardDelete: boolean;
  canSoftDelete: boolean;
  /** Drivers listed on any version of this policy. */
  blockingDrivers: Array<{ id: string; name: string }>;
  isDefault: boolean;
  isLastPolicy: boolean;
};

function driverName(d: PolicyDriverRef): string {
  return d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.id.slice(0, 8);
}

export function evaluateEarningsPolicyDeleteGuard(params: {
  policyId: string;
  policies?: EarningsPolicy[];
  drivers: PolicyDriverRef[];
}): EarningsPolicyDeleteGuardResult {
  const { policyId, policies = [], drivers } = params;

  const policy = policies.find((p) => p.id === policyId);
  const isDefault = !!policy?.isDefault;
  const isLastPolicy = policies.length <= 1;

  const assigned = policy
    ? driversForPolicy(policy, drivers)
    : [];
  const blockingDrivers = assigned.map((d) => ({ id: d.id, name: driverName(d) }));

  const hasAssignedDrivers = blockingDrivers.length > 0;
  const canHardDelete = !hasAssignedDrivers && !isDefault && !isLastPolicy;
  const canSoftDelete = !isDefault && !isLastPolicy;

  return {
    canHardDelete,
    canSoftDelete,
    blockingDrivers,
    isDefault,
    isLastPolicy,
  };
}
