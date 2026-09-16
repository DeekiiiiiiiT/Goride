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
import { isEntryInInclusiveYmdRange, toEntryYmd } from './fuelWeekPeriod';
import { odometerService } from '../services/odometerService';
import type { OdometerBucketAnchor } from '@roam/fuel-core';
import {
  evaluateFuelFinalizeGating,
  type FuelFinalizeGateResult,
} from './fuelFinalizeGating';
import { fetchTripsForFuelWeekPaged } from './fetchTripsForFuelWeek';
import type {
  FuelCard,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  MileageAdjustment,
  WeeklyFuelReport,
  FinalizedFuelReport,
} from '../types/fuel';
import type { FinancialTransaction, Trip } from '../types/data';
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
  /** Pending fuel reimbursements — Finalize hard-block (F3). */
  transactions?: FinancialTransaction[];
  personalAllowance?: PersonalAllowanceReconContext;
  seedPersonalAllowance?: boolean;
};

export async function fetchTripsForFuelWeek(weekStartYmd: string, weekEndYmd: string): Promise<Trip[]> {
  const { trips } = await fetchTripsForFuelWeekPaged(weekStartYmd, weekEndYmd);
  return trips;
}

export async function fetchTripsForFuelWeekWithMeta(
  weekStartYmd: string,
  weekEndYmd: string,
): Promise<{ trips: Trip[]; tripsTruncated: boolean }> {
  return fetchTripsForFuelWeekPaged(weekStartYmd, weekEndYmd);
}

/** Soft deadline so wizard open never hangs on one slow dependency. */
async function withSoftTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label: string,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const value = await Promise.race([
      promise.then((v) => {
        if (!timedOut) return v;
        return fallback;
      }),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          console.warn(`[buildFuelWeekReports] ${label} timed out after ${ms}ms — continuing`);
          resolve(fallback);
        }, ms);
      }),
    ]);
    return { value, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** C-5: soft-timeout / missing money inputs that must hard-block Finalize. */
export type FuelWeekDegradedInputs = {
  trips: boolean;
  deadhead: boolean;
  personalAllowance: boolean;
  brain: boolean;
  fuelCards: boolean;
};

export function fuelWeekHasDegradedInputs(d?: FuelWeekDegradedInputs | null): boolean {
  if (!d) return false;
  return d.trips || d.deadhead || d.personalAllowance || d.brain || d.fuelCards;
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
  // Prefer vehicles that actually appear in this week's work — skip idle fleet units.
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
): Promise<{ reports: WeeklyFuelReport[]; trips: Trip[]; degraded: FuelWeekDegradedInputs }> {
  const weekStartYmd = String(input.weekStartYmd).slice(0, 10);
  const weekEndYmd = String(input.weekEndYmd).slice(0, 10);
  const weekStart = parseISO(`${weekStartYmd}T12:00:00`);
  const weekEnd = parseISO(`${weekEndYmd}T12:00:00`);

  // [] from a parent still loading must not skip fetch — that zeros ride-share and dumps km into personal/deadhead.
  const needTripFetch = !(input.trips && input.trips.length > 0);
  const needPa = !input.personalAllowance;

  const degraded: FuelWeekDegradedInputs = {
    trips: false,
    deadhead: false,
    personalAllowance: false,
    brain: false,
    fuelCards: false,
  };

  // C-6 companion: entries with cardId require cards for attribution.
  const needsCards = (input.fuelEntries || []).some((e) => Boolean((e as any).cardId || (e as any).fuelCardId));
  if (needsCards && !(input.fuelCards && input.fuelCards.length > 0)) {
    degraded.fuelCards = true;
  }

  // Trips + deadhead + PA in parallel (were sequential — main wizard open cost).
  const [tripsRes, deadheadRes, paRes] = await Promise.all([
    needTripFetch
      ? withSoftTimeout(fetchTripsForFuelWeek(weekStartYmd, weekEndYmd), 20_000, [], 'trips')
      : Promise.resolve({ value: input.trips as Trip[], timedOut: false }),
    withSoftTimeout(fetchDeadheadMap(weekStartYmd, weekEndYmd), 15_000, new Map(), 'deadhead'),
    needPa
      ? withSoftTimeout(
          buildPersonalAllowanceReconContext({
            weekStartYmd,
            weekEndYmd,
            drivers: input.drivers,
            seedIfMissing: input.seedPersonalAllowance !== false,
          }).then((pa) => pa.context as PersonalAllowanceReconContext | undefined),
          20_000,
          undefined as PersonalAllowanceReconContext | undefined,
          'personalAllowance',
        ).catch((e) => {
          console.warn('[buildFuelWeekReports] PA context failed — continuing without', e);
          degraded.personalAllowance = true;
          return {
            value: undefined as PersonalAllowanceReconContext | undefined,
            timedOut: false,
          };
        })
      : Promise.resolve({
          value: input.personalAllowance,
          timedOut: false,
        }),
  ]);

  const trips = tripsRes.value;
  const deadheadMap = deadheadRes.value;
  const personalAllowance = paRes.value;
  if (tripsRes.timedOut) degraded.trips = true;
  if (deadheadRes.timedOut) degraded.deadhead = true;
  if (paRes.timedOut) degraded.personalAllowance = true;

  const weekVehicleIds = new Set(
    input.fuelEntries
      .filter((e) => e.vehicleId && isEntryInInclusiveYmdRange(e.date, weekStartYmd, weekEndYmd))
      .map((e) => e.vehicleId as string),
  );
  const brainVehicles =
    weekVehicleIds.size > 0
      ? input.vehicles.filter((v) => weekVehicleIds.has(v.id))
      : input.vehicles;

  const brainRes = await withSoftTimeout(
    buildBrainMap({
      vehicles: brainVehicles,
      trips,
      adjustments: input.adjustments,
      deadheadMap,
      weekStartYmd,
      weekEndYmd,
    }).then((m) => m),
    25_000,
    undefined as Map<string, FuelBrainClassificationInput> | undefined,
    'fuelBrain',
  );
  const brainByDriverVehicle = brainRes.value;
  if (brainRes.timedOut) degraded.brain = true;

  // H-8: same verified ledger anchors the Stop-to-Stop panel uses.
  const anchorsByVehicle = new Map<string, OdometerBucketAnchor[]>();
  await mapPool(
    [...weekVehicleIds],
    4,
    async (vehicleId) => {
      try {
        const history = await odometerService.getLedger(vehicleId, { limit: 5000 });
        const anchors: OdometerBucketAnchor[] = (history.data || [])
          .filter((h: any) => h.isVerified && h.isAnchorPoint)
          .map((h: any) => ({
            id: h.id,
            date: toEntryYmd(h.date),
            odometer: Number(h.value) || 0,
            referenceId: h.referenceId,
            source: h.source,
          }));
        if (anchors.length >= 2) anchorsByVehicle.set(vehicleId, anchors);
      } catch (e) {
        console.warn('[buildFuelWeekReports] ledger anchors failed for', vehicleId, e);
      }
    },
  );

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
    FLEET_USE_FUEL_BRAIN ? brainByDriverVehicle : undefined,
    personalAllowance,
    anchorsByVehicle.size > 0 ? anchorsByVehicle : undefined,
  );

  return { reports, trips, degraded };
}

export async function buildFuelWeekReportsWithGating(
  input: BuildFuelWeekReportsInput,
): Promise<{
  reports: WeeklyFuelReport[];
  trips: Trip[];
  gateResult: FuelFinalizeGateResult;
  degraded: FuelWeekDegradedInputs;
}> {
  const { reports, trips, degraded } = await buildFuelWeekReportsForFinalize(input);
  const gateResult = evaluateFuelFinalizeGating({
    reports,
    disputes: input.disputes,
    fuelEntries: input.fuelEntries,
    finalizedReports: input.finalizedReports,
    transactions: input.transactions,
    weekStartYmd: input.weekStartYmd,
    weekEndYmd: input.weekEndYmd,
  });
  return { reports, trips, gateResult, degraded };
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
