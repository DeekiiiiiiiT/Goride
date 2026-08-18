/**
 * Build WeeklyFuelReport[] for one Mon–Sun week — same money engine as
 * ReconciliationTable, without mounting the table (wizard + bulk Finalize).
 */
import { format, parseISO } from 'date-fns';
import { api } from '../services/api';
import {
  FuelCalculationService,
  type VehicleDeadheadInput,
  type FuelBrainClassificationInput,
  type PersonalAllowanceReconContext,
} from '../services/fuelCalculationService';
import { classifyWeekForRecon } from '../services/fuelBrainClient';
import { FLEET_USE_FUEL_BRAIN, FUEL_BRAIN_SHADOW_COMPARE } from '../utils/fuelBrainFlags';
import { resolveDeadheadHintForBrain, DEFAULT_INDUSTRY_FALLBACK_PCT } from '../utils/deadheadHintForBrain';
import { sumTripRideshareKm } from '../utils/tripRideshareKm';
import { mapPool } from './fuelMapPool';
import { buildPersonalAllowanceReconContext } from './buildPersonalAllowanceReconContext';
import {
  evaluateFuelFinalizeGating,
  type FuelFinalizeGateResult,
} from './fuelFinalizeGating';
import type {
  FuelCard,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  MileageAdjustment,
  WeeklyFuelReport,
  FinalizedFuelReport,
} from '../types/fuel';
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
  /** When provided and non-empty, skips trip fetch. Empty array is treated as not loaded. */
  trips?: Trip[];
  disputes?: FuelDispute[];
  finalizedReports?: FinalizedFuelReport[];
  personalAllowance?: PersonalAllowanceReconContext;
  seedPersonalAllowance?: boolean;
};

export async function fetchTripsForFuelWeek(weekStartYmd: string, weekEndYmd: string): Promise<Trip[]> {
  const response = await api.getTripsFiltered({
    startDate: weekStartYmd,
    endDate: weekEndYmd,
    limit: 1500,
    offset: 0,
  });
  return Array.isArray(response?.data) ? (response.data as Trip[]) : [];
}

export async function fetchDeadheadMap(
  weekStartYmd: string,
  weekEndYmd: string,
): Promise<Map<string, VehicleDeadheadInput>> {
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

export async function buildBrainMap(opts: {
  vehicles: Vehicle[];
  trips: Trip[];
  adjustments: MileageAdjustment[];
  deadheadMap: Map<string, VehicleDeadheadInput>;
  weekStartYmd: string;
  weekEndYmd: string;
}): Promise<Map<string, FuelBrainClassificationInput> | undefined> {
  if (!FLEET_USE_FUEL_BRAIN && !FUEL_BRAIN_SHADOW_COMPARE) return undefined;
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
          industryFallbackPct: DEFAULT_INDUSTRY_FALLBACK_PCT,
        }),
        industryFallbackPct: DEFAULT_INDUSTRY_FALLBACK_PCT,
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

  // [] from a parent still loading must not skip fetch — that zeros ride-share and dumps km into personal/deadhead.
  const trips =
    input.trips && input.trips.length > 0
      ? input.trips
      : await fetchTripsForFuelWeek(weekStartYmd, weekEndYmd);
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

  let personalAllowance = input.personalAllowance;
  if (!personalAllowance) {
    try {
      const pa = await buildPersonalAllowanceReconContext({
        weekStartYmd,
        weekEndYmd,
        drivers: input.drivers,
        seedIfMissing: input.seedPersonalAllowance !== false,
      });
      personalAllowance = pa.context;
    } catch (e) {
      console.warn('[buildFuelWeekReports] PA context failed — continuing without', e);
    }
  }

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
    FLEET_USE_FUEL_BRAIN ? brainByDriverVehicle : undefined,
    personalAllowance,
  );

  return { reports, trips };
}

export async function buildFuelWeekReportsWithGating(
  input: BuildFuelWeekReportsInput,
): Promise<{ reports: WeeklyFuelReport[]; trips: Trip[]; gateResult: FuelFinalizeGateResult }> {
  const { reports, trips } = await buildFuelWeekReportsForFinalize(input);
  const gateResult = evaluateFuelFinalizeGating({
    reports,
    disputes: input.disputes,
    fuelEntries: input.fuelEntries,
    finalizedReports: input.finalizedReports,
    weekStartYmd: input.weekStartYmd,
    weekEndYmd: input.weekEndYmd,
  });
  return { reports, trips, gateResult };
}

/** Soft cap — keeps bulk under edge timeout risk (one week per API cycle). */
export const FUEL_BULK_FINALIZE_MAX_WEEKS = 8;

/** Same soft cap for bulk reset of finalized weeks. */
export const FUEL_BULK_RESET_MAX_WEEKS = 8;

export function formatFuelBulkProgress(done: number, total: number, label: string): string {
  return `Finalizing ${label} (${done}/${total})…`;
}

export function formatFuelBulkResetProgress(done: number, total: number, label: string): string {
  return `Reopening ${label} (${done}/${total})…`;
}

export function fuelBulkConfirmPhrase(count: number): string {
  return `FINALIZE ${count} WEEKS`;
}

export function fuelBulkResetConfirmPhrase(count: number): string {
  return `REOPEN ${count} WEEKS`;
}

/** Used only for labels in tests / dialogs. */
export function fuelWeekLabelFromYmd(weekStartYmd: string, weekEndYmd: string): string {
  try {
    return `${format(parseISO(`${weekStartYmd}T12:00:00`), 'MMM d')} – ${format(parseISO(`${weekEndYmd}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${weekStartYmd} – ${weekEndYmd}`;
  }
}
