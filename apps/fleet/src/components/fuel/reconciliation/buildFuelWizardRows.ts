/**
 * Pure row builders for FuelPeriodWizard steps (Program 1 extraction).
 */
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { pickScenarioForDriverMembership, resolveDriverVersionForWeek } from '../../../utils/fuelPolicyVersion';
import { sumPaidByDriverForReport } from '../../../utils/fuelPaidByDriver';
import { UNASSIGNED_FUEL_DRIVER_ID } from '../../../types/fuel';
import type {
  FinalizedFuelReport,
  FuelCard,
  FuelEntry,
  FuelScenario,
  WeeklyFuelReport,
} from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import type { FuelQualityRow } from './FuelDataQualityStep';

/** Fleet driver row — typed for wizard display (M16). */
export type FuelWizardDriver = {
  id: string;
  driverId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fuelScenarioId?: string;
};

export type EnrichedVehicleSnap = {
  vehicleId: string;
  plate: string;
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  misc: number;
  pendingCount: number;
  hasOpenDispute: boolean;
  isFinalized: boolean;
  healthStatus?: string;
  driverSpend: number;
  netPay: number;
  odometerIncomplete: boolean;
  report?: WeeklyFuelReport;
};

export function resolveDriverDisplayName(
  report: WeeklyFuelReport | undefined,
  vehicle: Vehicle | undefined,
  drivers: FuelWizardDriver[],
): string {
  if (report?.driverId === UNASSIGNED_FUEL_DRIVER_ID) return 'Unassigned fills';
  const driverId = report?.driverId;
  const reportDriver = driverId
    ? drivers.find((d) => d.id === driverId || d.driverId === driverId)
    : null;
  return (
    reportDriver?.name ||
    [reportDriver?.firstName, reportDriver?.lastName].filter(Boolean).join(' ') ||
    vehicle?.currentDriverName ||
    'Unknown driver'
  );
}

export function toFuelQualityRow(
  v: EnrichedVehicleSnap,
  vehicles: Vehicle[],
  drivers: FuelWizardDriver[],
): FuelQualityRow {
  const vehicle = vehicles.find((x) => x.id === v.vehicleId);
  return {
    id: v.vehicleId,
    plate: v.plate,
    driverName: resolveDriverDisplayName(v.report, vehicle, drivers),
    healthStatus: (v.healthStatus as FuelQualityRow['healthStatus']) || undefined,
    pendingCount: v.pendingCount,
    totalSpend: v.totalSpend,
    companyShare: v.companyShare,
    driverShare: v.driverShare,
    cashFromEarnings: v.driverSpend,
    netPay: v.netPay,
    misc: v.misc,
    subtitle: [
      v.healthStatus && v.healthStatus !== 'Emerald' ? v.healthStatus : null,
      v.pendingCount > 0 ? `${v.pendingCount} pending log(s)` : null,
      v.odometerIncomplete ? 'Incomplete odometer data — unexplained fuel may be inflated' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function buildQualityRows(
  vehicleSnaps: EnrichedVehicleSnap[],
  vehicles: Vehicle[],
  drivers: FuelWizardDriver[],
): FuelQualityRow[] {
  return vehicleSnaps
    .filter(
      (v) =>
        v.pendingCount > 0 ||
        (v.healthStatus && v.healthStatus !== 'Emerald') ||
        v.odometerIncomplete,
    )
    .map((v) => toFuelQualityRow(v, vehicles, drivers));
}

export function buildBreakdownRows(
  vehicleSnaps: EnrichedVehicleSnap[],
  vehicles: Vehicle[],
  drivers: FuelWizardDriver[],
): FuelQualityRow[] {
  return vehicleSnaps
    .filter((v) => v.totalSpend > FUEL_SPEND_EPS)
    .map((v) => toFuelQualityRow(v, vehicles, drivers));
}

export function buildLeakageRows(vehicleSnaps: EnrichedVehicleSnap[]) {
  return vehicleSnaps
    .filter((v) => Math.abs(v.misc) > FUEL_SPEND_EPS)
    .map((v) => ({
      id: v.vehicleId,
      title: v.plate,
      subtitle:
        v.misc < 0
          ? 'Over-explained — categorized km exceed fuel bought'
          : v.odometerIncomplete
            ? 'Incomplete odometer data — unexplained fuel may be inflated'
            : v.healthStatus && v.healthStatus !== 'Emerald'
              ? String(v.healthStatus)
              : 'Unexplained fuel',
      right: formatFuelMoney(v.misc),
      badge: v.misc < 0 ? 'Over-explained' : 'Unexplained',
      warn: true as const,
    }));
}

export function buildSettlementRows(input: {
  liveReports: WeeklyFuelReport[];
  vehicles: Vehicle[];
  fuelEntries: FuelEntry[];
  fuelCards: FuelCard[];
  weekTrips: Trip[];
  periodLocked: boolean;
}) {
  const { liveReports, vehicles, fuelEntries, fuelCards, weekTrips, periodLocked } = input;
  return liveReports
    .filter((r) => r.totalGasCardCost > FUEL_SPEND_EPS)
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicleId);
      const cashFromEarnings = sumPaidByDriverForReport(fuelEntries, r, vehicles, {
        vehicles,
        fuelCards,
        trips: weekTrips,
      });
      return {
        id: r.driverId || r.vehicleId,
        plate: v?.licensePlate || r.vehicleId,
        cashFromEarnings,
        driverShare: r.driverShare,
        netPay: cashFromEarnings - r.driverShare,
        pending: r.pendingCount || 0,
        status: periodLocked ? 'Locked' : (r.pendingCount || 0) > 0 ? 'Pending' : 'Draft',
      };
    });
}

export function buildPolicyRows(input: {
  vehicles: Vehicle[];
  vehicleSnaps: EnrichedVehicleSnap[];
  liveReports: WeeklyFuelReport[];
  scenarios: FuelScenario[];
  weekStart: string;
}) {
  const { vehicles, vehicleSnaps, liveReports, scenarios, weekStart } = input;
  return vehicles
    .filter((v) => vehicleSnaps.some((s) => s.vehicleId === v.id && s.totalSpend > FUEL_SPEND_EPS))
    .map((v) => {
      const live = liveReports.find(
        (r) => r.vehicleId === v.id || (r.vehicleIds || []).includes(v.id),
      );
      const driverId = live?.driverId;
      const hit = resolveDriverVersionForWeek(scenarios, driverId, weekStart);
      const scenario = hit
        ? { ...hit.scenario, rules: hit.version.rules }
        : pickScenarioForDriverMembership(scenarios, driverId, weekStart);
      const fuelRule = scenario?.rules?.find((r) => r.category === 'Fuel');
      return {
        vehicle: v,
        scenario,
        fuelRule,
        effectiveFrom: hit?.version.effectiveFrom,
      };
    });
}

export function buildPriorMedian(
  finalizedReports: FinalizedFuelReport[],
  periodStartDate: string,
): { totalSpend: number; unexplained: number } | undefined {
  const byWeek = new Map<string, { spend: number; unexplained: number }>();
  for (const f of finalizedReports) {
    const wk = String(f.weekStart || '').split('T')[0];
    if (!wk || wk >= periodStartDate) continue;
    const cur = byWeek.get(wk) || { spend: 0, unexplained: 0 };
    cur.spend += Number(f.totalGasCardCost) || 0;
    cur.unexplained += Number(f.miscellaneousCost) || 0;
    byWeek.set(wk, cur);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4);
  if (!weeks.length) return undefined;
  const spends = weeks.map(([, v]) => v.spend).sort((a, b) => a - b);
  const unex = weeks.map(([, v]) => v.unexplained).sort((a, b) => a - b);
  const mid = Math.floor(spends.length / 2);
  return {
    totalSpend: spends.length % 2 ? spends[mid] : (spends[mid - 1] + spends[mid]) / 2,
    unexplained: unex.length % 2 ? unex[mid] : (unex[mid - 1] + unex[mid]) / 2,
  };
}

export type MoneyStripTotals = {
  totalSpend: number;
  gasCard: number;
  cashFromEarnings: number;
  company: number;
  driver: number;
  leakage: number;
};

export function buildMoneyStrip(input: {
  liveReports: WeeklyFuelReport[];
  fuelEntries: FuelEntry[];
  vehicles: Vehicle[];
  fuelCards: FuelCard[];
  weekTrips: Trip[];
  sumGasCard: (
    entries: FuelEntry[],
    report: WeeklyFuelReport,
    vehicles: Vehicle[],
    ctx: { vehicles: Vehicle[]; fuelCards: FuelCard[]; trips: Trip[] },
  ) => number;
  sumPaidByDriver: typeof sumPaidByDriverForReport;
}): MoneyStripTotals {
  const { liveReports, fuelEntries, vehicles, fuelCards, weekTrips, sumGasCard, sumPaidByDriver } =
    input;
  const paidByDriverCtx = { vehicles, fuelCards, trips: weekTrips };
  let gasCard = 0;
  let cashFromEarnings = 0;
  let totalSpend = 0;
  let company = 0;
  let driver = 0;
  let leakage = 0;
  for (const r of liveReports) {
    gasCard += sumGasCard(fuelEntries, r, vehicles, paidByDriverCtx);
    cashFromEarnings += sumPaidByDriver(fuelEntries, r, vehicles, paidByDriverCtx);
    totalSpend += Number(r.totalGasCardCost) || 0;
    company += Number(r.companyShare) || 0;
    driver += Number(r.driverShare) || 0;
    leakage += Number(r.miscellaneousCost) || 0;
  }
  return { totalSpend, gasCard, cashFromEarnings, company, driver, leakage };
}
