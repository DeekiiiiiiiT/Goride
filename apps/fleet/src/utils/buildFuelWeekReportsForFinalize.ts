/**
 * Build WeeklyFuelReport[] for one Mon–Sun week — same money engine as
 * ReconciliationTable, without mounting the table (for bulk Finalize).
 */
import { format, parseISO } from 'date-fns';
import { api } from '../services/api';
import {
  FuelCalculationService,
  type VehicleDeadheadInput,
  type FuelBrainClassificationInput,
} from '../services/fuelCalculationService';
import { classifyWeekForRecon } from '../services/fuelBrainClient';
import { FLEET_USE_FUEL_BRAIN } from '../utils/fuelBrainFlags';
import { resolveDeadheadHintForBrain } from '../utils/deadheadHintForBrain';
import { sumTripRideshareKm } from '../utils/tripRideshareKm';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, WeeklyFuelReport } from '../types/fuel';
import type { Trip } from '../types/data';
import type { Vehicle } from '../types/vehicle';

export type BuildFuelWeekReportsInput = {
  weekStartYmd: string;
  weekEndYmd: string;
  vehicles: Vehicle[];
  drivers: Array<{ id: string; fuelScenarioId?: string; name?: string; driverId?: string }>;
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  scenarios: FuelScenario[];
  fuelCards: FuelCard[];
  /** When provided, skips trip fetch. */
  trips?: Trip[];
};

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function fetchTripsForFuelWeek(weekStartYmd: string, weekEndYmd: string): Promise<Trip[]> {
  const response = await api.getTripsFiltered({
    startDate: weekStartYmd,
    endDate: weekEndYmd,
    limit: 1500,
    offset: 0,
  });
  return Array.isArray(response?.data) ? (response.data as Trip[]) : [];
}

async function fetchDeadheadMap(weekStartYmd: string, weekEndYmd: string): Promise<Map<string, VehicleDeadheadInput>> {
  const map = new Map<string, VehicleDeadheadInput>();
  try {
    const data = await api.getFleetDeadhead(weekStartYmd, weekEndYmd);
    for (const v of (data as any)?.vehicles || []) {
      map.set(v.vehicleId, {
        vehicleId: v.vehicleId,
        deadheadKm: v.deadheadKm || 0,
        personalKm: v.personalKm || 0,
        totalOdometerKm: v.totalOdometerKm || 0,
        tripKm: v.tripKm || 0,
        method: v.method || 'fallback',
        confidenceLevel: v.confidenceLevel || 'low',
        confidenceReason: v.confidenceReason || 'No data',
      });
    }
  } catch (e) {
    console.warn('[buildFuelWeekReports] deadhead fetch failed — continuing without', e);
  }
  return map;
}

async function buildBrainMap(opts: {
  vehicles: Vehicle[];
  trips: Trip[];
  adjustments: MileageAdjustment[];
  deadheadMap: Map<string, VehicleDeadheadInput>;
  weekStartYmd: string;
  weekEndYmd: string;
}): Promise<Map<string, FuelBrainClassificationInput> | undefined> {
  if (!FLEET_USE_FUEL_BRAIN) return undefined;
  const targets = opts.vehicles.filter((v) => v.currentDriverId);
  const pairs = await mapPool(targets, 3, async (v) => {
    const driverId = String(v.currentDriverId || '');
    const vTrips = opts.trips.filter(
      (t) => t.vehicleId === v.id && (t.status === 'Completed' || t.status === 'Cancelled'),
    );
    const vAdj = opts.adjustments.filter((a) => a.vehicleId === v.id);
    const companyOpsKm = vAdj
      .filter((a) => a.type === 'Company_Misc' || a.type === 'Maintenance')
      .reduce((s, a) => s + (a.distance || 0), 0);
    const dh = opts.deadheadMap.get(v.id);
    const tripRideshareKm = sumTripRideshareKm(vTrips);
    try {
      const classified = await classifyWeekForRecon({
        driverId,
        vehicleId: v.id,
        weekStart: opts.weekStartYmd,
        weekEnd: opts.weekEndYmd,
        totalOdometerKm: dh?.totalOdometerKm || 0,
        tripRideshareKm,
        companyOpsKm,
        deadheadHintKm: resolveDeadheadHintForBrain({
          server: dh,
          clientTripRideshareKm: tripRideshareKm,
          companyOpsKm,
        }),
      });
      return {
        key: `${driverId}:${v.id}`,
        value: {
          rideShareKm: classified.rideShareKm,
          personalKm: classified.personalKm,
          companyOpsKm: classified.companyOpsKm,
          deadheadKm: classified.deadheadKm,
          availableKm: classified.availableKm,
          confidence: classified.confidence as Record<string, string>,
          method: classified.method,
        } as FuelBrainClassificationInput,
      };
    } catch {
      return null;
    }
  });

  const map = new Map<string, FuelBrainClassificationInput>();
  for (const row of pairs) {
    if (row) map.set(row.key, row.value);
  }
  return map;
}

/**
 * Produces the same WeeklyFuelReport[] shape Finalize expects for one week.
 */
export async function buildFuelWeekReportsForFinalize(
  input: BuildFuelWeekReportsInput,
): Promise<{ reports: WeeklyFuelReport[]; trips: Trip[] }> {
  const weekStartYmd = String(input.weekStartYmd).slice(0, 10);
  const weekEndYmd = String(input.weekEndYmd).slice(0, 10);
  const weekStart = parseISO(`${weekStartYmd}T12:00:00`);
  const weekEnd = parseISO(`${weekEndYmd}T12:00:00`);

  const trips = input.trips ?? (await fetchTripsForFuelWeek(weekStartYmd, weekEndYmd));
  const deadheadMap = await fetchDeadheadMap(weekStartYmd, weekEndYmd);
  const brainByDriverVehicle = await buildBrainMap({
    vehicles: input.vehicles,
    trips,
    adjustments: input.adjustments,
    deadheadMap,
    weekStartYmd,
    weekEndYmd,
  });

  const drivers = input.drivers.map((d) => ({
    id: String(d.id || d.driverId || ''),
    fuelScenarioId: d.fuelScenarioId,
    name: d.name,
  })).filter((d) => d.id);

  const reports = FuelCalculationService.generateDriverFleetReport(
    input.vehicles,
    drivers,
    weekStart,
    weekEnd,
    trips,
    input.fuelEntries,
    input.adjustments,
    input.scenarios,
    deadheadMap,
    input.fuelCards,
    brainByDriverVehicle,
  );

  return { reports, trips };
}

/** Soft cap — keeps bulk under edge timeout risk (one week per API cycle). */
export const FUEL_BULK_FINALIZE_MAX_WEEKS = 8;

export function formatFuelBulkProgress(done: number, total: number, label: string): string {
  return `Finalizing ${label} (${done}/${total})…`;
}

export function fuelBulkConfirmPhrase(count: number): string {
  return `FINALIZE ${count} WEEKS`;
}

/** Used only for labels in tests / dialogs. */
export function fuelWeekLabelFromYmd(weekStartYmd: string, weekEndYmd: string): string {
  try {
    return `${format(parseISO(`${weekStartYmd}T12:00:00`), 'MMM d')} – ${format(parseISO(`${weekEndYmd}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${weekStartYmd} – ${weekEndYmd}`;
  }
}
