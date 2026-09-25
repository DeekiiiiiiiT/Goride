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
import { isFuelReconPeriodLocked } from '@roam/fuel-core';

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
    if (isFuelReconPeriodLocked({ status: r.status, lockedAt: r.lockedAt })) {
      set.add(weekStartYmd(r.weekStart));
    }
  }
  return set;
}

/**
 * Empty open SQL shells (ensure without materialize) — dropped from landing cards
 * and must not block client gap-fill, or weeks with live fuel spend vanish.
 */
export function isHollowOpenFuelPeriodRow(row: {
  status?: string | null;
  lockedAt?: string | null;
  totalSpend?: number | null;
  vehicleCount?: number | null;
}): boolean {
  if (isFuelReconPeriodLocked({ status: row.status, lockedAt: row.lockedAt })) return false;
  const totalSpend = Number(row.totalSpend) || 0;
  const vehicleCount = Number(row.vehicleCount) || 0;
  return totalSpend <= FUEL_SPEND_EPS && vehicleCount <= 0;
}

/** Weeks SQL may own on landing (excludes hollow open shells). */
export function serverLandingCoveringWeekStarts(rows: FuelPeriodRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (isHollowOpenFuelPeriodRow(r)) continue;
    const wk = weekStartYmd(r.weekStart);
    if (wk) set.add(wk);
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
  const hasRaw =
    raw && typeof raw === 'object' && Object.keys(raw as object).length > 0;
  if (hasRaw) {
    for (const stepId of Object.keys(counts) as FuelStepId[]) {
      const c = (raw as any)[stepId];
      if (c && typeof c === 'object') {
        const actionable = Number(c.actionable) || 0;
        // Persisted clear steps historically wrote informational:1 ("touched").
        // Landing chips treat informational>0 + actionable=0 as "Not evaluated" —
        // that sentinel is only for missing counts (fabricate below). Clear → Done.
        counts[stepId] = {
          actionable,
          informational: actionable > 0 ? Number(c.informational) || 0 : 0,
        };
      }
    }
  } else if (!locked) {
    // H-4: never fabricate "Done" for unevaluated steps. Mark informational=1
    // so the UI can show "Not evaluated" instead of a green check.
    for (const stepId of Object.keys(counts) as FuelStepId[]) {
      counts[stepId] = { actionable: 0, informational: 1 };
    }
  }
  // Provisional leakage/finalize chips when SQL has money but no counts jsonb yet
  if (!locked && Math.abs(unexplained) > FUEL_SPEND_EPS && !leakageReviewed) {
    if (counts['leakage-gap'].actionable === 0) counts['leakage-gap'].actionable = 1;
    if (counts.finalize.actionable === 0) counts.finalize.actionable = 1;
    // Clear the "not evaluated" informational once we know leakage needs review.
    counts['leakage-gap'].informational = 0;
    counts.finalize.informational = 0;
  }
  if (locked) {
    for (const stepId of Object.keys(counts) as FuelStepId[]) {
      if (counts[stepId].actionable > 0) {
        counts[stepId].informational += counts[stepId].actionable;
        counts[stepId].actionable = 0;
      }
      // Locked + no open work → Done (legacy empty counts already {0,0}).
      if (counts[stepId].actionable === 0) {
        counts[stepId].informational = 0;
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
    const locked = isFuelReconPeriodLocked({ status: s.status, lockedAt: s.lockedAt });
    const totalSpend = Number(s.totalSpend) || 0;
    const unexplained = Number(s.unexplained) || 0;
    const vehicleCount = Number(s.vehicleCount) || 0;
    // Hollow open shells are not landing cards — gap-fill may paint live spend instead.
    if (isHollowOpenFuelPeriodRow(s)) continue;

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
    // SQL period row exists ⇒ operator opened / worked this week → In Progress.
    const operatorStarted = true;
    const status = classifyFuelReconPeriodStatus({
      locked,
      withSpendCount: Math.max(vehicleCount, totalSpend > FUEL_SPEND_EPS ? 1 : 0),
      exceptionCount: locked ? 0 : counts['data-quality']?.actionable || 0,
      openDisputeCount: locked ? 0 : openDisputeCount,
      leakageActionable: locked ? 0 : counts['leakage-gap']?.actionable || 0,
      operatorStarted,
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
      openFlaggedFillCount: 0,
      dataQualityVehicleActionable: locked ? 0 : counts['data-quality']?.actionable || 0,
      counts,
      leakageReviewed: locked || Boolean(s.leakageReviewedAt),
      odometerChainReviewed: locked || Boolean(s.odometerChainReviewedAt),
      unattributedReviewed: locked || Boolean(s.unattributedReviewedAt),
      stopToStopGapAccepts: Array.isArray(s.stopToStopGapAccepts)
        ? s.stopToStopGapAccepts
        : [],
      fuelSealError: s.fuelSealError ? String(s.fuelSealError) : null,
    });
  }
  return out;
}

/**
 * P-3: server cards are SoT for weeks SQL can paint (non-hollow).
 * Derived fills weeks with no covering server card — including hollow open shells
 * that ensure created without materialize (those rows are dropped above).
 */
export function mergeServerFirstLandingPeriods(
  serverRows: FuelPeriodRow[],
  derived: FuelReconciliationPeriod[],
): FuelReconciliationPeriod[] {
  const serverCards = serverRowsToLandingPeriods(serverRows);
  const byWeek = new Map<string, FuelReconciliationPeriod>();
  for (const p of serverCards) byWeek.set(p.startDate, p);

  for (const d of derived) {
    // Gap-fill only — do not overwrite or dual-merge covering server weeks.
    if (byWeek.has(d.startDate)) continue;
    byWeek.set(d.startDate, d);
  }

  return [...byWeek.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
}
