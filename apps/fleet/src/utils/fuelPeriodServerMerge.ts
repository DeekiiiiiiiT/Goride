/**
 * Overlay SQL fuel_reconciliation_period rows onto browser-derived landing cards.
 * Landing SoT: paint server rows first; derive only enriches step chips when present.
 */
import type { FuelPeriodRow } from '../hooks/useFuelPeriods';
import type { FuelReconciliationPeriod } from './fuelPeriodStatus';
import { classifyFuelReconPeriodStatus } from './fuelPeriodStatus';
import { emptyFuelStepCounts, fuelActionableTotal, type FuelStepId } from './fuelPeriodGating';
import { fuelWeekBoundsFromPeriodId, formatWeekPeriodLabel } from './fuelWeekPeriod';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';
import { endOfWeek, parseISO, format } from 'date-fns';

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

function coerceStepCounts(
  raw: FuelPeriodRow['counts'] | undefined,
  locked: boolean,
  unexplained: number,
  leakageReviewed: boolean,
): FuelReconciliationPeriod['counts'] {
  const counts = emptyFuelStepCounts();
  if (raw && typeof raw === 'object') {
    for (const stepId of Object.keys(counts) as FuelStepId[]) {
      const c = (raw as any)[stepId];
      if (c && typeof c === 'object') {
        counts[stepId] = {
          actionable: Number(c.actionable) || 0,
          informational: Number(c.informational) || 0,
        };
      }
    }
  }
  // Provisional chips when SQL has money but no counts jsonb yet
  if (!locked && Math.abs(unexplained) > FUEL_SPEND_EPS && !leakageReviewed) {
    if (counts['leakage-gap'].actionable === 0) counts['leakage-gap'].actionable = 1;
    if (counts.finalize.actionable === 0) counts.finalize.actionable = 1;
  }
  if (locked) {
    for (const stepId of Object.keys(counts) as FuelStepId[]) {
      if (counts[stepId].actionable > 0) {
        counts[stepId].informational += counts[stepId].actionable;
        counts[stepId].actionable = 0;
      }
    }
  }
  return counts;
}

/** Map SQL period rows → landing cards (instant paint — no browser week engines). */
export function serverRowsToLandingPeriods(rows: FuelPeriodRow[]): FuelReconciliationPeriod[] {
  const out: FuelReconciliationPeriod[] = [];
  for (const s of rows) {
    const startDate = weekStartYmd(s.weekStart);
    if (!startDate) continue;
    const locked = s.status === 'locked' || Boolean(s.lockedAt);
    const totalSpend = Number(s.totalSpend) || 0;
    const unexplained = Number(s.unexplained) || 0;
    const vehicleCount = Number(s.vehicleCount) || 0;
    if (!locked && totalSpend <= FUEL_SPEND_EPS && vehicleCount <= 0) continue;

    let endDate = weekStartYmd(s.weekEnd);
    let label: string;
    try {
      const bounds = fuelWeekBoundsFromPeriodId(startDate);
      endDate = endDate || bounds.endDate;
      label = bounds.label;
    } catch {
      const ws = parseISO(startDate);
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      endDate = endDate || format(we, 'yyyy-MM-dd');
      label = formatWeekPeriodLabel(ws, we);
    }

    const counts = coerceStepCounts(
      s.counts,
      locked,
      unexplained,
      Boolean(s.leakageReviewedAt),
    );
    const openDisputeCount = counts['adjustments-disputes']?.actionable || 0;
    const status = classifyFuelReconPeriodStatus({
      locked,
      withSpendCount: Math.max(vehicleCount, totalSpend > FUEL_SPEND_EPS ? 1 : 0),
      exceptionCount: locked ? 0 : counts['data-quality']?.actionable || 0,
      openDisputeCount: locked ? 0 : openDisputeCount,
      leakageActionable: locked ? 0 : counts['leakage-gap']?.actionable || 0,
    });

    out.push({
      id: startDate,
      startDate,
      endDate,
      label,
      status,
      locked,
      vehicleCount: Math.max(vehicleCount, totalSpend > FUEL_SPEND_EPS ? 1 : 0),
      totalSpend,
      netLeakage: unexplained,
      companyShare: Number(s.companyShare) || 0,
      driverShare: Number(s.driverShare) || 0,
      actionableTotal: locked ? 0 : fuelActionableTotal(counts),
      exceptionCount: locked ? 0 : counts['data-quality']?.actionable || 0,
      counts,
    });
  }
  return out;
}

/**
 * Server cards win for money/lock. Derived fills gaps (weeks not yet in SQL)
 * and can refresh step counts when present.
 */
export function mergeServerFirstLandingPeriods(
  serverRows: FuelPeriodRow[],
  derived: FuelReconciliationPeriod[],
): FuelReconciliationPeriod[] {
  const serverCards = serverRowsToLandingPeriods(serverRows);
  const byWeek = new Map<string, FuelReconciliationPeriod>();
  for (const p of serverCards) byWeek.set(p.startDate, p);

  for (const d of derived) {
    const existing = byWeek.get(d.startDate);
    if (!existing) {
      byWeek.set(d.startDate, d);
      continue;
    }
    // Prefer server money; keep richer derived step chips when server counts were empty/provisional
    const serverHadCounts =
      serverRows.find((r) => weekStartYmd(r.weekStart) === d.startDate)?.counts &&
      Object.keys(
        serverRows.find((r) => weekStartYmd(r.weekStart) === d.startDate)?.counts || {},
      ).length > 0;
    byWeek.set(d.startDate, {
      ...existing,
      counts: serverHadCounts ? existing.counts : d.counts,
      actionableTotal: serverHadCounts ? existing.actionableTotal : d.actionableTotal,
      exceptionCount: serverHadCounts ? existing.exceptionCount : d.exceptionCount,
      // Derived may know lock from finalized snaps before SQL mirrors
      locked: existing.locked || d.locked,
      status:
        existing.locked || d.locked
          ? 'completed'
          : existing.status === 'outstanding' || d.status === 'outstanding'
            ? 'outstanding'
            : existing.status,
    });
  }

  return [...byWeek.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function overlayServerFuelPeriods(
  derived: FuelReconciliationPeriod[],
  serverRows: FuelPeriodRow[],
): FuelReconciliationPeriod[] {
  // Legacy name — landing now uses server-first merge.
  return mergeServerFirstLandingPeriods(serverRows, derived);
}
