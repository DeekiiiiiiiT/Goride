/**
 * Overlay SQL fuel_reconciliation_period rows onto browser-derived landing cards (Wave G).
 * Locked / computed server money wins; open weeks keep derive until recompute catches up.
 */
import type { FuelPeriodRow } from '../hooks/useFuelPeriods';
import type { FuelReconciliationPeriod } from './fuelPeriodStatus';
import { classifyFuelReconPeriodStatus } from './fuelPeriodStatus';

export function weekStartYmd(v: unknown): string {
  return String(v || '').split('T')[0];
}

export function serverLeakageReviewedWeekStarts(rows: FuelPeriodRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.leakageReviewedAt) set.add(weekStartYmd(r.weekStart));
  }
  return set;
}

export function serverLockedWeekStarts(rows: FuelPeriodRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.status === 'locked' || r.lockedAt) set.add(weekStartYmd(r.weekStart));
  }
  return set;
}

/** Weeks whose landing money can come from SQL (skip client week engines). */
export function serverComputedWeekStarts(rows: FuelPeriodRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.computedAt || r.status === 'locked' || r.lockedAt) {
      set.add(weekStartYmd(r.weekStart));
    }
  }
  return set;
}

export function overlayServerFuelPeriods(
  derived: FuelReconciliationPeriod[],
  serverRows: FuelPeriodRow[],
): FuelReconciliationPeriod[] {
  const byWeek = new Map<string, FuelPeriodRow>();
  for (const r of serverRows) {
    byWeek.set(weekStartYmd(r.weekStart), r);
  }

  return derived.map((p) => {
    const s = byWeek.get(p.startDate);
    if (!s) return p;

    const locked = p.locked || s.status === 'locked' || Boolean(s.lockedAt);
    const useServerMoney =
      locked || Boolean(s.computedAt) || (Number(s.totalSpend) || 0) > 0;

    const next: FuelReconciliationPeriod = {
      ...p,
      locked,
      totalSpend: useServerMoney
        ? (Number.isFinite(Number(s.totalSpend)) ? Number(s.totalSpend) : p.totalSpend)
        : p.totalSpend,
      netLeakage: useServerMoney
        ? (Number.isFinite(Number(s.unexplained)) ? Number(s.unexplained) : p.netLeakage)
        : p.netLeakage,
      companyShare: useServerMoney
        ? (Number.isFinite(Number(s.companyShare)) ? Number(s.companyShare) : p.companyShare)
        : p.companyShare,
      driverShare: useServerMoney
        ? (Number.isFinite(Number(s.driverShare)) ? Number(s.driverShare) : p.driverShare)
        : p.driverShare,
      vehicleCount: Number(s.vehicleCount) > 0 ? Number(s.vehicleCount) : p.vehicleCount,
      actionableTotal: locked ? 0 : p.actionableTotal,
      exceptionCount: locked ? 0 : p.exceptionCount,
    };

    next.status = classifyFuelReconPeriodStatus({
      locked: next.locked,
      withSpendCount: next.vehicleCount,
      exceptionCount: next.exceptionCount,
      openDisputeCount: locked ? 0 : next.counts['adjustments-disputes']?.actionable || 0,
      leakageActionable: locked ? 0 : next.counts['leakage-gap']?.actionable || 0,
    });

    return next;
  });
}
