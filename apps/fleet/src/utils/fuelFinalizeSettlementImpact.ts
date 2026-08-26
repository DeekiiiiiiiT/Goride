/**
 * Before fuel finalize: if payouts already exist and leftover would change,
 * surface impacts for an explicit "Reopen settlement" confirm.
 */
import { computePeriodSettlement } from '@roam/finance-core';
import { api } from '../services/api';
import type { DriverFinancialPeriodClient } from '../hooks/useDriverFinancialPeriods';
import { reportWeekYmdBounds } from './fuelWeekPeriod';

const PAID_EPS = 0.005;
const DELTA_EPS = 0.01;

export type FuelFinalizeReportLike = {
  driverId: string;
  weekStart: string;
  weekEnd?: string;
  driverShare: number;
  companyShare: number;
};

export type FuelSettlementReopenImpact = {
  driverId: string;
  weekStart: string;
  settlementPaid: number;
  beforeResidual: number;
  afterResidual: number;
  beforeLabel: string;
  afterLabel: string;
};

export type PeriodSettlementSnapshot = {
  periodAnchor: string;
  driverShare: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  cashCollected: number;
  cashReturned: number;
  cashWrittenOff: number;
  tollCashSpend: number;
  tollChargedToDriver: number;
  settlementPaid: number;
  settlementAmount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function residualBalanceLabel(residual: number): string {
  const r = round2(residual);
  if (Math.abs(r) < DELTA_EPS) return 'Settled ($0 leftover)';
  if (r > 0) {
    return `Fleet owes $${Math.abs(r).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `Driver owes $${Math.abs(r).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Pure estimate — swap proposed fuel into an existing period snapshot. */
export function estimateResidualAfterProposedFuel(
  period: PeriodSettlementSnapshot,
  proposed: { fuelDeduction: number; fuelFleetShare: number },
): number {
  const settled = computePeriodSettlement({
    driverShare: Number(period.driverShare) || 0,
    fuelDeduction: Math.max(0, Number(proposed.fuelDeduction) || 0),
    baseCashOwed: Number(period.cashCollected) || 0,
    baseCashPaid: Number(period.cashReturned) || 0,
    tollCashWash: Number(period.tollCashSpend) || 0,
    tollPersonal: Math.max(0, Number(period.tollChargedToDriver) || 0),
    fuelCredits: Math.max(0, Number(proposed.fuelFleetShare) || 0),
    cashWrittenOff: Number(period.cashWrittenOff) || 0,
    settlementPaid: Number(period.settlementPaid) || 0,
  });
  return round2(settled.settlement);
}

export function impactFromPeriodAndProposedFuel(
  period: PeriodSettlementSnapshot,
  proposed: { fuelDeduction: number; fuelFleetShare: number },
  driverId: string,
): FuelSettlementReopenImpact | null {
  const settlementPaid = round2(Math.max(0, Number(period.settlementPaid) || 0));
  if (settlementPaid <= PAID_EPS) return null;

  const beforeResidual = round2(Number(period.settlementAmount) || 0);
  const afterResidual = estimateResidualAfterProposedFuel(period, proposed);
  if (Math.abs(afterResidual - beforeResidual) <= DELTA_EPS) return null;

  return {
    driverId,
    weekStart: String(period.periodAnchor).slice(0, 10),
    settlementPaid,
    beforeResidual,
    afterResidual,
    beforeLabel: residualBalanceLabel(beforeResidual),
    afterLabel: residualBalanceLabel(afterResidual),
  };
}

function toSnapshot(p: DriverFinancialPeriodClient): PeriodSettlementSnapshot {
  return {
    periodAnchor: String(p.periodAnchor).slice(0, 10),
    driverShare: Number(p.driverShare) || 0,
    fuelDeduction: Number(p.fuelDeduction) || 0,
    fuelFleetShare: Number(p.fuelFleetShare) || 0,
    cashCollected: Number(p.cashCollected) || 0,
    cashReturned: Number(p.cashReturned) || 0,
    cashWrittenOff: Number(p.cashWrittenOff) || 0,
    tollCashSpend: Number(p.tollCashSpend) || 0,
    tollChargedToDriver: Number(p.tollChargedToDriver) || 0,
    settlementPaid: Number(p.settlementPaid) || 0,
    settlementAmount: Number(p.settlementAmount) || 0,
  };
}

/** Group multi-vehicle reports into per driver+Monday fuel totals. */
export function aggregateProposedFuelByDriverWeek(
  reports: FuelFinalizeReportLike[],
): Map<string, { driverId: string; weekStart: string; fuelDeduction: number; fuelFleetShare: number }> {
  const map = new Map<
    string,
    { driverId: string; weekStart: string; fuelDeduction: number; fuelFleetShare: number }
  >();
  for (const report of reports) {
    const driverId = String(report.driverId || '').trim();
    if (!driverId) continue;
    const weekStart = reportWeekYmdBounds(report).start;
    const key = `${driverId}|${weekStart}`;
    const cur = map.get(key) || {
      driverId,
      weekStart,
      fuelDeduction: 0,
      fuelFleetShare: 0,
    };
    cur.fuelDeduction = round2(cur.fuelDeduction + (Number(report.driverShare) || 0));
    cur.fuelFleetShare = round2(cur.fuelFleetShare + (Number(report.companyShare) || 0));
    map.set(key, cur);
  }
  return map;
}

/**
 * Load current periods and return weeks that need an explicit reopen confirm.
 */
export async function assessFuelFinalizeSettlementImpact(
  reports: FuelFinalizeReportLike[],
  loadPeriods: (driverId: string) => Promise<DriverFinancialPeriodClient[]> = async (driverId) => {
    const res = await api.getDriverFinancialPeriods(driverId);
    return Array.isArray(res?.data) ? (res.data as DriverFinancialPeriodClient[]) : [];
  },
): Promise<FuelSettlementReopenImpact[]> {
  const proposedByKey = aggregateProposedFuelByDriverWeek(reports);
  if (proposedByKey.size === 0) return [];

  const driverIds = [...new Set([...proposedByKey.values()].map((v) => v.driverId))];
  const periodsByDriver = new Map<string, DriverFinancialPeriodClient[]>();
  await Promise.all(
    driverIds.map(async (driverId) => {
      try {
        periodsByDriver.set(driverId, await loadPeriods(driverId));
      } catch {
        periodsByDriver.set(driverId, []);
      }
    }),
  );

  const impacts: FuelSettlementReopenImpact[] = [];
  for (const proposed of proposedByKey.values()) {
    const periods = periodsByDriver.get(proposed.driverId) || [];
    const period = periods.find(
      (p) => String(p.periodAnchor).slice(0, 10) === proposed.weekStart,
    );
    if (!period) continue;
    const impact = impactFromPeriodAndProposedFuel(
      toSnapshot(period),
      {
        fuelDeduction: proposed.fuelDeduction,
        fuelFleetShare: proposed.fuelFleetShare,
      },
      proposed.driverId,
    );
    if (impact) impacts.push(impact);
  }

  return impacts.sort((a, b) => {
    const week = b.weekStart.localeCompare(a.weekStart);
    if (week !== 0) return week;
    return a.driverId.localeCompare(b.driverId);
  });
}
