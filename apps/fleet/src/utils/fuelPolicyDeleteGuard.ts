/**
 * Guards Fleet Policy delete: block when drivers are on schedule versions or open weeks need the policy.
 */

import type { FinalizedFuelReport, FuelEntry, FuelScenario } from '../types/fuel';
import { driversForPolicy } from './fuelPolicyAssignment';
import {
  generateFuelWeekOptions,
  isYmdInFuelWeek,
  type PeriodWeekOption,
} from './fuelWeekPeriod';

export type PolicyDriverRef = {
  id: string;
  fuelScenarioId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};

export type DeleteGuardWeek = {
  startDate: string;
  endDate: string;
  label: string;
};

export type FuelPolicyDeleteGuardResult = {
  canHardDelete: boolean;
  /** Drivers listed on any version of this policy. */
  blockingDrivers: Array<{ id: string; name: string }>;
  openWeeks: DeleteGuardWeek[];
  finalizedWeeks: DeleteGuardWeek[];
  warnOnly: boolean;
};

function driverName(d: PolicyDriverRef): string {
  return d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.id.slice(0, 8);
}

function scenarioIdFromFinalized(report: FinalizedFuelReport): string | undefined {
  const meta = report.metadata || {};
  return (
    meta.appliedScenario?.id ||
    meta.scenarioId ||
    undefined
  );
}

export function evaluateFuelPolicyDeleteGuard(params: {
  policyId: string;
  scenarios?: FuelScenario[];
  drivers: PolicyDriverRef[];
  fuelEntries: FuelEntry[];
  finalizedReports: FinalizedFuelReport[];
  weekOptions?: PeriodWeekOption[];
  timezone?: string;
}): FuelPolicyDeleteGuardResult {
  const {
    policyId,
    scenarios = [],
    drivers,
    fuelEntries,
    finalizedReports,
    weekOptions = generateFuelWeekOptions(16, params.timezone),
    timezone,
  } = params;
  void timezone;

  const policy = scenarios.find((s) => s.id === policyId);
  const assigned = policy
    ? driversForPolicy(policy, drivers)
    : drivers.filter((d) => d.fuelScenarioId === policyId);
  const blockingDrivers = assigned.map((d) => ({ id: d.id, name: driverName(d) }));
  const assignedIds = new Set(assigned.map((d) => d.id));

  const openWeeks: DeleteGuardWeek[] = [];
  for (const week of weekOptions) {
    const start = week.startDate;
    const end = week.endDate;
    const weekFinalizedForAssigned = finalizedReports.some((f) => {
      if (String(f.weekStart).split('T')[0] !== start) return false;
      if (!f.driverId || !assignedIds.has(f.driverId)) return false;
      return true;
    });
    if (weekFinalizedForAssigned) continue;

    const hasActivity = fuelEntries.some((e) => {
      if (!isYmdInFuelWeek(e.date, start, end)) return false;
      if (!e.driverId || !assignedIds.has(e.driverId)) return false;
      return (e.amount || 0) > 0.009 || e.reconciliationStatus === 'Pending';
    });
    if (hasActivity) {
      openWeeks.push({
        startDate: start,
        endDate: end,
        label: week.label || `${start} – ${end}`,
      });
    }
  }

  const finalizedWeekMap = new Map<string, DeleteGuardWeek>();
  for (const f of finalizedReports) {
    if (scenarioIdFromFinalized(f) !== policyId) continue;
    const start = String(f.weekStart).split('T')[0];
    if (finalizedWeekMap.has(start)) continue;
    const end = String(f.weekEnd || '').split('T')[0] || start;
    finalizedWeekMap.set(start, {
      startDate: start,
      endDate: end,
      label: `${start} – ${end}`,
    });
  }
  const finalizedWeeks = Array.from(finalizedWeekMap.values());

  const canHardDelete = blockingDrivers.length === 0 && openWeeks.length === 0;
  const warnOnly = canHardDelete && finalizedWeeks.length > 0;

  return {
    canHardDelete,
    blockingDrivers,
    openWeeks,
    finalizedWeeks,
    warnOnly,
  };
}
