/**
 * Shared period-derivation helpers — landing, wizard, and bulk must agree (M6/M7/NEW-1).
 */
import type {
  FuelDispute,
  FuelEntry,
  FuelScenario,
  FinalizedFuelReport,
  WeeklyFuelReport,
} from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import { reportWeekYmdBounds, toEntryYmd, isYmdInFuelWeek } from './fuelWeekPeriod';
import { isSameFuelStatement } from './fuelWeekPeriod';
import { fuelOpsSpendAmount } from './fuelOpsEligibility';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

export interface FuelPeriodVehicleSnapshot {
  vehicleId: string;
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  misc: number;
  healthStatus?: 'Emerald' | 'Amber' | 'Red' | string;
  pendingCount: number;
  hasOpenDispute: boolean;
  hasScenarioAssigned: boolean;
  isFinalized: boolean;
  /** Shared-car presence without owning the driver-week money row */
  hasWeekActivity?: boolean;
}

/** Dispute open in this Monday–Sunday week — YMD-normalized (never raw string split alone). */
export function isFuelDisputeOpenInWeek(
  d: FuelDispute,
  weekStartYmd: string,
  weekEndYmd: string,
): boolean {
  if (d.status !== 'Open') return false;
  const ws = toEntryYmd(d.weekStart);
  if (ws) return ws === weekStartYmd;
  const we = toEntryYmd(d.weekEnd);
  if (we) return we >= weekStartYmd && we <= weekEndYmd;
  const created = toEntryYmd((d as any).createdAt);
  return created ? created >= weekStartYmd && created <= weekEndYmd : false;
}

/** Finalized snapshot for a vehicle in a week — vehicle match first, then unclaimed driver match. */
export function findFinalizedSnapForVehicle(opts: {
  finalizedReports: FinalizedFuelReport[];
  vehicle: Vehicle;
  weekStartYmd: string;
  claimedKeys: Set<string>;
}): FinalizedFuelReport | undefined {
  const { finalizedReports, vehicle, weekStartYmd, claimedKeys } = opts;
  const byVehicle = finalizedReports.find(
    (f) => toEntryYmd(f.weekStart) === weekStartYmd && f.vehicleId === vehicle.id,
  );
  if (byVehicle) {
    const key = `fin:${byVehicle.driverId || byVehicle.vehicleId}:${weekStartYmd}`;
    if (!claimedKeys.has(key)) {
      claimedKeys.add(key);
      return byVehicle;
    }
  }
  if (!vehicle.currentDriverId) return undefined;
  const byDriver = finalizedReports.find(
    (f) => toEntryYmd(f.weekStart) === weekStartYmd && f.driverId === vehicle.currentDriverId,
  );
  if (!byDriver) return undefined;
  const key = `fin:${byDriver.driverId || byDriver.vehicleId}:${weekStartYmd}`;
  if (claimedKeys.has(key)) return undefined;
  claimedKeys.add(key);
  return byDriver;
}

export function findLiveReportForVehicle(
  reports: WeeklyFuelReport[],
  vehicleId: string,
): WeeklyFuelReport | undefined {
  return reports.find(
    (r) =>
      r.vehicleId === vehicleId ||
      (Array.isArray(r.vehicleIds) && r.vehicleIds.includes(vehicleId)),
  );
}

export function isReportFinalizedForPeriod(
  finalizedReports: FinalizedFuelReport[],
  report: WeeklyFuelReport,
): boolean {
  return finalizedReports.some((f) => isSameFuelStatement(f, report));
}

export function reportWeekBoundsSafe(report: Pick<WeeklyFuelReport, 'weekStart' | 'weekEnd'>): {
  start: string;
  end: string;
} {
  return reportWeekYmdBounds(report);
}

/** Per-vehicle money slice after primary-vehicle claiming (C3). */
export type FuelLiveMoneySlice = {
  vehicleId: string;
  totalGasCardCost: number;
  companyShare: number;
  driverShare: number;
  miscellaneousCost: number;
  healthStatus?: string;
  pendingCount?: number;
  metadata?: { scenarioId?: string };
  /** Driver-week report that owns this money (primary only). */
  sourceReportKey?: string;
};

/**
 * Expand driver-week reports into per-vehicle slices with money on the primary vehicle only.
 * Secondary shared-car vehicles get zero money so they stay visible without double-counting.
 */
export function liveReportsToPrimaryClaimedSlices(
  reports: Array<{
    vehicleId?: string;
    vehicleIds?: string[];
    driverId?: string;
    totalGasCardCost?: number;
    companyShare?: number;
    driverShare?: number;
    miscellaneousCost?: number;
    healthStatus?: string;
    pendingCount?: number;
    metadata?: { scenarioId?: string };
  }>,
): FuelLiveMoneySlice[] {
  const slices: FuelLiveMoneySlice[] = [];
  for (const r of reports) {
    const vehicleIds =
      Array.isArray(r.vehicleIds) && r.vehicleIds.length > 0
        ? r.vehicleIds
        : r.vehicleId
          ? [r.vehicleId]
          : [];
    const primaryId = r.vehicleId || vehicleIds[0];
    const uniq = [...new Set(vehicleIds.length ? vehicleIds : primaryId ? [primaryId] : [])];
    const sourceReportKey = `${r.driverId || r.vehicleId || primaryId}`;
    for (const vehicleId of uniq) {
      const isPrimary = vehicleId === primaryId;
      slices.push({
        vehicleId,
        totalGasCardCost: isPrimary ? Number(r.totalGasCardCost) || 0 : 0,
        companyShare: isPrimary ? Number(r.companyShare) || 0 : 0,
        driverShare: isPrimary ? Number(r.driverShare) || 0 : 0,
        miscellaneousCost: isPrimary ? Number(r.miscellaneousCost) || 0 : 0,
        healthStatus: isPrimary ? r.healthStatus : undefined,
        pendingCount: isPrimary ? r.pendingCount : 0,
        metadata: isPrimary ? r.metadata : undefined,
        sourceReportKey: isPrimary ? sourceReportKey : undefined,
      });
    }
  }
  return slices;
}

export type BuildFuelVehicleSnapshotsInput = {
  vehicles: Vehicle[];
  weekStartYmd: string;
  weekEndYmd: string;
  fuelEntries: FuelEntry[];
  disputes: FuelDispute[];
  finalizedReports: FinalizedFuelReport[];
  scenarios?: FuelScenario[];
  /**
   * Already primary-claimed per-vehicle slices (landing live map),
   * OR pass raw reports via liveReportsToPrimaryClaimedSlices first.
   */
  liveSlices?: FuelLiveMoneySlice[];
};

export type BuildFuelVehicleSnapshotsResult = {
  snapshots: FuelPeriodVehicleSnapshot[];
  openDisputes: FuelDispute[];
};

/**
 * Single source of truth for per-vehicle week snapshots (NEW-1 / C3 / M7).
 * Money from each live/finalized driver-week row attaches to at most one vehicle.
 */
export function buildFuelVehicleSnapshots(
  input: BuildFuelVehicleSnapshotsInput,
): BuildFuelVehicleSnapshotsResult {
  const {
    vehicles,
    weekStartYmd,
    weekEndYmd,
    fuelEntries,
    disputes,
    finalizedReports,
    scenarios = [],
    liveSlices = [],
  } = input;

  const weekEntries = fuelEntries.filter((e) =>
    isYmdInFuelWeek(e.date, weekStartYmd, weekEndYmd),
  );
  const openDisputes = disputes.filter((d) =>
    isFuelDisputeOpenInWeek(d, weekStartYmd, weekEndYmd),
  );

  const claimedFinalizedKeys = new Set<string>();
  const claimedLiveKeys = new Set<string>();

  const snapshots: FuelPeriodVehicleSnapshot[] = vehicles.map((vehicle) => {
    const liveReport = liveSlices.find((r) => r.vehicleId === vehicle.id);
    const liveKey = liveReport
      ? `live:${liveReport.sourceReportKey || liveReport.vehicleId}:${Number(liveReport.totalGasCardCost) || 0}:${Number(liveReport.miscellaneousCost) || 0}`
      : '';
    const finalizedSnap = findFinalizedSnapForVehicle({
      finalizedReports,
      vehicle,
      weekStartYmd,
      claimedKeys: claimedFinalizedKeys,
    });

    const ownsLiveMoney =
      Boolean(liveReport) &&
      (Number(liveReport!.totalGasCardCost) || 0) > FUEL_SPEND_EPS &&
      !claimedLiveKeys.has(liveKey);
    if (ownsLiveMoney && liveKey) claimedLiveKeys.add(liveKey);

    const ownsFinalizedMoney = Boolean(finalizedSnap);
    const vEntries = weekEntries.filter((e) => e.vehicleId === vehicle.id);
    const moneyFromLive = ownsLiveMoney ? liveReport : undefined;
    const moneyFromFinalized = !moneyFromLive && ownsFinalizedMoney ? finalizedSnap : undefined;

    const totalSpend =
      moneyFromLive?.totalGasCardCost ??
      moneyFromFinalized?.totalGasCardCost ??
      (liveReport ? 0 : vEntries.reduce((s, e) => s + fuelOpsSpendAmount(e), 0));

    const pendingCount =
      liveReport?.pendingCount ??
      (finalizedSnap ? 0 : vEntries.filter((e) => e.reconciliationStatus === 'Pending').length);

    const hasOpenDispute = openDisputes.some((d) => d.vehicleId === vehicle.id);
    const hasScenarioAssigned =
      Boolean(vehicle.fuelScenarioId) ||
      Boolean(scenarios.some((s) => s.isDefault)) ||
      Boolean(liveReport?.metadata?.scenarioId) ||
      Boolean((finalizedSnap as any)?.metadata?.scenarioId);

    const hasWeekActivity =
      vEntries.length > 0 || Boolean(liveReport) || Boolean(finalizedSnap);

    return {
      vehicleId: vehicle.id,
      totalSpend: Number(totalSpend) || 0,
      companyShare:
        Number(moneyFromLive?.companyShare ?? moneyFromFinalized?.companyShare ?? 0) || 0,
      driverShare:
        Number(moneyFromLive?.driverShare ?? moneyFromFinalized?.driverShare ?? 0) || 0,
      misc:
        Number(
          moneyFromLive?.miscellaneousCost ?? moneyFromFinalized?.miscellaneousCost ?? 0,
        ) || 0,
      healthStatus: liveReport?.healthStatus ?? finalizedSnap?.healthStatus,
      pendingCount: Number(pendingCount) || 0,
      hasOpenDispute,
      hasScenarioAssigned,
      isFinalized: Boolean(finalizedSnap),
      hasWeekActivity,
    };
  });

  return { snapshots, openDisputes };
}
