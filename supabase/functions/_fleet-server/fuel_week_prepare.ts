/**
 * Prepare one fuel week with the same engine the screen uses.
 * Distances are saved first. This function does not close tank cycles or lock the week.
 */
import * as kv from "./kv_store.tsx";
import { filterRecordsByOrganizationId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import { loadWeekFuelEntries } from "./fuel_period_build_snapshots.ts";
import { computeFleetDeadhead } from "./fuel_distance.ts";
import { loadOrgPreferences } from "./fuel_org_preferences.ts";
import { listOdometerLedger } from "./odometer_ledger.ts";
import { resolveActiveEarningsBundleForDriverWeek } from "./earnings_policy_runtime.ts";
import { buildEvidenceLadder } from "../../../packages/fuel-core/src/evidenceLadder.ts";
import { referenceEfficiencyFromFills } from "../../../packages/fuel-core/src/referenceEfficiency.ts";
import { referenceFillsFromEntries } from "../../../packages/fuel-core/src/referenceFills.ts";
import { addDaysYmd, fleetCalendarDay } from "../../../packages/fuel-core/src/fleetTime.ts";
import { measureOffAppKm } from "./fuel_shift_km.ts";
import type { ShiftTrip } from "../../../packages/fuel-core/src/shiftLegs.ts";
import { FuelCalculationService } from "../../../packages/fuel-core/src/fuelCalculationService.ts";
import { fuelEntriesForWeekEngine } from "../../../packages/fuel-core/src/selectWeekFuelFills.ts";
import {
  fuelOpsSpendAmount,
  isGasCardFuelEntry,
} from "../../../packages/fuel-core/src/fuelOpsEligibility.ts";
import { resolveFuelFillDriver } from "../../../packages/fuel-core/src/resolveFuelFillDriver.ts";
import { sumTripRideshareKm } from "../../../packages/fuel-core/src/tripRideshareKm.ts";
import { selectOdometerBucketsClosingInWeek } from "../../../packages/fuel-core/src/fuelWeekRange.ts";
import { pickScenarioForDriverMembership } from "../../../packages/fuel-core/src/fuelPolicyVersion.ts";
import {
  mergePersonalAllowanceDefaults,
  personalAllowanceBonusKey,
} from "../../../packages/fuel-core/src/personalAllowance.ts";
import type { FuelEntry } from "../../../packages/fuel-core/src/fuelTypes.ts";
import { listAllUnifiedCanonicalEvents } from "../_shared/unifiedLedger/queries.ts";

function ymd(value: unknown): string {
  return String(value || "").split("T")[0];
}

async function loadDomain(domain: Parameters<typeof queryFleet>[0], orgId: string, extra: Record<string, unknown> = {}) {
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const res = await queryFleet(domain, { org: orgId, limit: page, offset, ...extra });
    if (res.error) throw res.error;
    const chunk = (res.data || []) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < page) break;
    offset += chunk.length;
    if (offset > 20000) break;
  }
  return rows;
}

function asEntry(row: Record<string, unknown>): FuelEntry {
  const meta = row.metadata && typeof row.metadata === "object"
    ? (row.metadata as Record<string, unknown>)
    : undefined;
  return {
    ...(row as unknown as FuelEntry),
    id: String(row.id || ""),
    type: String(row.type || "Manual_Entry") as FuelEntry["type"],
    date: String(row.date || ""),
    time: row.time ? String(row.time) : undefined,
    amount: Number(row.amount) || Number(row.cost) || 0,
    liters: row.liters != null ? Number(row.liters) : undefined,
    odometer: row.odometer != null && row.odometer !== "" ? Number(row.odometer) : undefined,
    vehicleId: String(row.vehicleId || row.vehicle_id || ""),
    driverId: String(row.driverId || row.driver_id || "") || undefined,
    paymentSource: (row.paymentSource || row.payment_source || undefined) as FuelEntry["paymentSource"],
    cardId: (row.cardId || row.fuelCardId || undefined) as string | undefined,
    metadata: meta,
    reconciliationStatus: String(row.reconciliationStatus || row.reconciliation_status || "Pending") as FuelEntry["reconciliationStatus"],
  };
}

/** Read a saved pin. Week calculate never writes the driver. */
async function pinDriverHome(
  driver: Record<string, unknown> | undefined,
): Promise<{ lat: number; lng: number; source: "home" | "address" } | null> {
  if (!driver) return null;
  const lat = Number(driver.homeLat);
  const lng = Number(driver.homeLng);
  if (!(lat && lng)) return null;
  const source = driver.homePinSource === "address" ? "address" : "home";
  return { lat, lng, source };
}

function asShiftTrip(trip: Record<string, unknown>): ShiftTrip {
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: String(trip.id || ""),
    requestTime: trip.requestTime ? String(trip.requestTime) : undefined,
    dropoffTime: trip.dropoffTime ? String(trip.dropoffTime) : undefined,
    date: trip.date ? String(trip.date) : undefined,
    startLat: num(trip.startLat),
    startLng: num(trip.startLng),
    endLat: num(trip.endLat),
    endLng: num(trip.endLng),
    pickupLocation: trip.pickupLocation ? String(trip.pickupLocation) : undefined,
    dropoffLocation: trip.dropoffLocation ? String(trip.dropoffLocation) : undefined,
    enrouteKm: Number(trip.normalizedEnrouteDistance) || 0,
    openKm: Number(trip.normalizedOpenDistance) || 0,
    unavailableKm: Number(trip.normalizedUnavailableDistance) || 0,
  };
}

/** Cap a server hint at the kilometres left. Do not raise it to 35%. */
function deadheadHintKm(server: Record<string, unknown> | undefined, tripKm: number, companyOpsKm: number): number {
  const rawHint = Math.max(0, Number(server?.deadheadKm) || 0);
  const odo = Math.max(0, Number(server?.totalOdometerKm) || 0);
  const available = odo > 0 ? Math.max(0, odo - Math.max(0, tripKm) - companyOpsKm) : 0;
  if (server?.method === "fallback") return 0;
  if (!(available > 0)) return rawHint;
  return Number(Math.min(available, rawHint).toFixed(2));
}

export async function prepareFuelWeekReports(args: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
  /** Shadow compares must not overwrite saved distances. */
  persistDistance?: boolean;
}): Promise<
  | { ok: true; reports: Record<string, unknown>[]; totalSpend: number }
  | { ok: false; reports: []; totalSpend: 0; error: string }
> {
  const orgId = String(args.orgId || "").trim();
  const weekStart = ymd(args.weekStart);
  const weekEnd = ymd(args.weekEnd);
  if (!orgId || !weekStart || !weekEnd) {
    return { ok: false, reports: [], totalSpend: 0, error: "missing_org_or_week" };
  }

  try {
    const rawEntries = await loadWeekFuelEntries(orgId, weekStart, weekEnd);
    const entries = fuelEntriesForWeekEngine(rawEntries.map(asEntry));
    const vehicleIds = [
      ...new Set(entries.map((entry) => String(entry.vehicleId || "")).filter(Boolean)),
    ];

    const distance = await computeFleetDeadhead({
      orgId,
      periodStart: weekStart,
      periodEnd: weekEnd,
      vehicleIds,
    });
    const sb = getServiceClient();
    const distanceByVehicle = new Map<string, Record<string, unknown>>();
    for (const row of distance.vehicles || []) {
      const vehicleId = String(row.vehicleId || "");
      if (!vehicleId) continue;
      distanceByVehicle.set(vehicleId, row);
      if (args.persistDistance === false) continue;
      const { error } = await sb.from("vehicle_week_distance").upsert(
        {
          organization_id: orgId,
          vehicle_id: vehicleId,
          week_start: weekStart,
          deadhead_km: Number(row.deadheadKm) || 0,
          rideshare_km: Number(row.tripKm) || 0,
          trip_km: Number(row.tripKm) || 0,
          personal_km: Number(row.personalKm) || 0,
          computed_from_hash: `${weekStart}:${vehicleId}`,
          stale: false,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,vehicle_id,week_start" },
      );
      if (error) throw new Error(error.message);
    }

    const saved = vehicleIds.length
      ? await sb
        .from("vehicle_week_distance")
        .select("vehicle_id, deadhead_km, trip_km, personal_km, stale")
        .eq("organization_id", orgId)
        .eq("week_start", weekStart)
        .in("vehicle_id", vehicleIds)
      : { data: [], error: null };
    if (saved.error) throw new Error(saved.error.message);
    const persistDistance = args.persistDistance !== false;
    if (persistDistance && ((saved.data || []).length < vehicleIds.length || (saved.data || []).some((row) => row.stale))) {
      throw new Error("distance_not_saved");
    }
    const distanceRows = persistDistance
      ? (saved.data || [])
      : [...distanceByVehicle.entries()].map(([vehicleId, source]) => ({
        vehicle_id: vehicleId,
        deadhead_km: Number(source.deadheadKm) || 0,
        trip_km: Number(source.tripKm) || 0,
        personal_km: Number(source.personalKm) || 0,
        stale: false,
      }));

    const deadheadMap = new Map<string, {
      vehicleId: string;
      deadheadKm: number;
      personalKm: number;
      totalOdometerKm: number;
      tripKm: number;
      method: string;
      confidenceLevel: string;
      confidenceReason: string;
      priorOdometer?: number;
      priorAt?: string;
      referenceKmPerLiter?: number | null;
      referenceDegraded?: boolean;
      referenceReason?: string;
      priorClockAssumed?: boolean;
    }>();
    for (const row of distanceRows) {
      const vehicleId = String(row.vehicle_id || "");
      const source = distanceByVehicle.get(vehicleId) || {};
      deadheadMap.set(vehicleId, {
        vehicleId,
        deadheadKm: Number(row.deadhead_km) || 0,
        personalKm: Number(row.personal_km) || 0,
        tripKm: Number(row.trip_km) || 0,
        totalOdometerKm: Number(source.totalOdometerKm) || 0,
        method: String(source.method || "fallback"),
        confidenceLevel: String(source.confidenceLevel || "low"),
        confidenceReason: String(source.confidenceReason || ""),
        priorOdometer: Number(source.priorOdometer) || 0,
        priorAt: String(source.priorAt || ""),
        priorClockAssumed: Boolean(source.priorClockAssumed),
      });
    }

    const priorDays = [...deadheadMap.values()]
      .map((row) => fleetCalendarDay(String(row.priorAt || "")))
      .filter(Boolean)
      .sort();
    const tripFrom = priorDays[0] ? addDaysYmd(priorDays[0], -1) : addDaysYmd(weekStart, -1);
    const [vehicles, drivers, cards, adjustments, trips, policies, scenariosRaw, prefs] = await Promise.all([
      loadDomain("vehicles", orgId),
      loadDomain("drivers", orgId),
      loadDomain("fuel_cards", orgId),
      loadDomain("fuel_adjustments", orgId),
      loadDomain("trips", orgId, { dateFrom: tripFrom, dateTo: weekEnd }),
      loadDomain("earnings_policies", orgId),
      kv.getByPrefix("fuel_scenario:"),
      loadOrgPreferences(orgId),
    ]);
    const scenarios = filterRecordsByOrganizationId(
      ((scenariosRaw || []) as Record<string, unknown>[]),
      orgId,
    );
    const weekAdjustments = adjustments.filter((row) => {
      const day = ymd(row.date);
      return day >= weekStart && day <= weekEnd;
    });

    const historyRows = await loadDomain("fuel_entries", orgId, {
      dateFrom: addDaysYmd(weekStart, -120),
      dateTo: addDaysYmd(weekStart, -1),
    });
    const brain = new Map<string, Record<string, unknown>>();
    for (const vehicle of vehicles) {
      const driverId = String(vehicle.currentDriverId || "");
      if (!driverId) continue;
      const vehicleId = String(vehicle.id || "");
      const driver = drivers.find((row) => String(row.id || "") === driverId);
      const home = await pinDriverHome(driver);
      const homeMissing = !home;
      const vehicleTrips = trips.filter((trip) =>
        String(trip.vehicleId || "") === vehicleId &&
        (trip.status === "Completed" || trip.status === "Cancelled")
      );
      const companyOpsKm = weekAdjustments
        .filter((row) => String(row.vehicleId || "") === vehicleId)
        .filter((row) => row.type === "Company_Misc" || row.type === "Maintenance")
        .reduce((sum, row) => sum + (Number(row.distance) || 0), 0);
      const evidencedPersonalKm = weekAdjustments
        .filter((row) => String(row.vehicleId || "") === vehicleId)
        .filter((row) => row.type === "Personal")
        .reduce((sum, row) => sum + (Number(row.distance) || 0), 0);
      const dh = deadheadMap.get(vehicleId);
      const spanKm = Number(dh?.totalOdometerKm) || 0;
      const routed = await measureOffAppKm({
        home,
        trips: vehicleTrips.map((trip) => asShiftTrip(trip)),
      });
      const fallbackReposition = deadheadHintKm(
        dh as unknown as Record<string, unknown>,
        sumTripRideshareKm(vehicleTrips as never),
        companyOpsKm,
      );
      const repositionMeasured = routed.repositionMeasured && routed.repositionKm != null;
      const repositionNote = !repositionMeasured
        ? "Estimated from time between trips"
        : routed.repositionAnyEstimated && routed.repositionAnySkipped
          ? "Some gaps used a straight-line estimate and some could not be routed"
          : routed.repositionAnyEstimated
            ? "Some gaps used a straight-line estimate"
            : routed.repositionAnySkipped
              ? "Some gaps could not be routed"
              : "Measured route between dropoff and next pickup";
      const ladder = buildEvidenceLadder({
        spanKm,
        companyOpsKm,
        evidencedPersonalKm,
        commuteKm: routed.commuteKm,
        homeMissing,
        repositionKm: repositionMeasured ? routed.repositionKm! : fallbackReposition,
        repositionConfidence: repositionMeasured && !routed.repositionAnyEstimated ? "measured" : "estimated",
        repositionNote,
        trips: vehicleTrips.map((trip) => {
          const platform = String(trip.platform || "");
          const positioningMissing = platform !== "" && platform.toLowerCase() !== "uber";
          return {
            id: String(trip.id || ""),
            platform,
            onTripKm: Number(trip.distance) || 0,
            enrouteKm: Number(trip.normalizedEnrouteDistance) || 0,
            openKm: Number(trip.normalizedOpenDistance) || 0,
            unavailableKm: Number(trip.normalizedUnavailableDistance) || 0,
            positioningMissing,
          };
        }),
      });
      const tank = Number(vehicle.specifications && (vehicle.specifications as { tankCapacity?: number }).tankCapacity)
        || Number(vehicle.fuelSettings && (vehicle.fuelSettings as { tankCapacity?: number }).tankCapacity)
        || 0;
      const ref = referenceEfficiencyFromFills(
        referenceFillsFromEntries(
          historyRows
            .filter((row) => String(row.vehicleId || row.vehicle_id || "") === vehicleId)
            .map(asEntry),
          { tankCapacityLiters: tank || null },
        ),
        weekStart,
      );
      if (dh) {
        dh.referenceKmPerLiter = ref.kmPerLiter;
        dh.referenceDegraded = ref.degraded;
        dh.referenceReason = ref.reason;
      }
      brain.set(`${driverId}:${vehicleId}`, {
        rideShareKm: ladder.onlineKm,
        personalKm: ladder.personalKm,
        companyOpsKm: ladder.companyOpsKm,
        deadheadKm: ladder.repositionKm,
        commuteKm: ladder.commuteKm,
        unattributedKm: ladder.unattributedKm,
        availableKm: ladder.unattributedKm + ladder.repositionKm + ladder.commuteKm,
        method: "fuel-chain-v2",
        confidence: { rideShare: "high", deadhead: "medium", personal: "high" },
        onlinePositioningPct: ladder.onlinePositioningPct,
        homeMissing: ladder.homeMissing,
        homePinSource: home?.source,
        kmSources: ladder.sources,
      });
    }

    const anchors = new Map<string, Array<{ id: string; date: string; odometer: number; referenceId?: string; source?: string }>>();
    for (const vehicleId of vehicleIds) {
      const history = await listOdometerLedger(vehicleId, { limit: 5000 });
      const points = (history.data || [])
        .filter((row) => row.isVerified && row.isAnchorPoint)
        .map((row) => ({
          id: String(row.id || ""),
          date: ymd(row.date || row.recordedAt),
          odometer: Number(row.value) || 0,
          referenceId: row.referenceId ? String(row.referenceId) : undefined,
          source: row.source ? String(row.source) : undefined,
        }));
      if (points.length >= 2) anchors.set(vehicleId, points);
    }

    const paConfig = mergePersonalAllowanceDefaults(
      (prefs.personalAllowance || null) as never,
    );
    const bonusByDriverId = new Map<string, number>();
    const bonusLedger = (prefs.personalAllowanceBonuses || {}) as Record<string, number>;
    for (const driver of drivers) {
      const id = String(driver.id || "");
      if (!id) continue;
      const km = Number(bonusLedger[personalAllowanceBonusKey(id, weekStart)]) || 0;
      if (km > 0) bonusByDriverId.set(id, km);
    }
    const ledgerGrossByDriverId = new Map<string, number>();
    const fareRows = await listAllUnifiedCanonicalEvents({
      organizationId: orgId,
      entryTypes: ["fare_earning"],
      from: weekStart,
      to: weekEnd,
      maxRows: 8000,
    });
    for (const row of fareRows) {
      const driverId = String(row.driverId || "");
      if (!driverId) continue;
      const gross = Number(row.grossAmount);
      ledgerGrossByDriverId.set(
        driverId,
        (ledgerGrossByDriverId.get(driverId) || 0) + (Number.isFinite(gross) ? gross : 0),
      );
    }
    const legacy = {
      tiers: Array.isArray(prefs.tiers) ? prefs.tiers : [],
      quotas: prefs.quotas || {
        daily: { enabled: false, amount: 0 },
        weekly: { enabled: false, amount: 0 },
        monthly: { enabled: false, amount: 0 },
      },
      personalAllowance: paConfig,
    };
    const personalAllowance = {
      config: paConfig,
      quotaConfig: (prefs.quotas || null) as never,
      bonusByDriverId,
      ledgerGrossByDriverId,
      resolveForDriver: (driverId: string) => {
        const bundle = resolveActiveEarningsBundleForDriverWeek({
          policies,
          driverId,
          weekStartYmd: weekStart,
          legacy: legacy as never,
          serviceLine: "rideshare",
        });
        return {
          config: bundle.personalAllowance,
          quotaConfig: bundle.quotas,
          earningsPolicy: {
            policyId: bundle.policyId,
            versionId: bundle.versionId,
            source: bundle.source,
            policyName: bundle.policyName,
          },
        };
      },
    };

    const weekStartDate = new Date(`${weekStart}T12:00:00`);
    const weekEndDate = new Date(`${weekEnd}T12:00:00`);
    const reports = FuelCalculationService.generateDriverFleetReport(
      vehicles as never,
      drivers.map((driver) => ({
        id: String(driver.id || ""),
        fuelScenarioId: driver.fuelScenarioId ? String(driver.fuelScenarioId) : undefined,
        name: driver.name ? String(driver.name) : undefined,
      })).filter((driver) => driver.id),
      weekStartDate,
      weekEndDate,
      trips as never,
      entries,
      weekAdjustments as never,
      scenarios as never,
      deadheadMap as never,
      cards as never,
      brain as never,
      personalAllowance as never,
      anchors.size > 0 ? (anchors as never) : undefined,
    );

    for (const report of reports) {
      if (Array.isArray(report.odometerBuckets) && report.odometerBuckets.length > 0) {
        report.odometerBuckets = selectOdometerBucketsClosingInWeek(
          report.odometerBuckets,
          weekStart,
          weekEnd,
        );
      }
    }

    const spendEntries = entries.filter((entry) => fuelOpsSpendAmount(entry) > 0);
    const byDriver = new Map<string, FuelEntry[]>();
    for (const entry of spendEntries) {
      const resolved = resolveFuelFillDriver({
        entry,
        vehicles: vehicles as never,
        fuelCards: cards as never,
        trips: trips as never,
      });
      const driverId = resolved.driverId || String(entry.driverId || "");
      const list = byDriver.get(driverId) || [];
      list.push(entry);
      byDriver.set(driverId, list);
    }

    const stamped = reports.map((report) => {
      const driverId = String(report.driverId || "");
      const mine = byDriver.get(driverId) || [];
      let gas = 0;
      let cash = 0;
      for (const entry of mine) {
        const amount = fuelOpsSpendAmount(entry);
        if (isGasCardFuelEntry(entry)) gas += amount;
        else cash += amount;
      }
      const scenario = pickScenarioForDriverMembership(scenarios as never, driverId, weekStart);
      const fuelRule = scenario?.rules?.find((rule) => rule.category === "Fuel") || null;
      const meta = (report.metadata && typeof report.metadata === "object" ? report.metadata : {}) as Record<string, unknown>;
      const rideShareCost = Number(report.rideShareCost);
      return {
        ...report,
        id: report.id || `${driverId}_${weekStart}`,
        weekStart,
        weekEnd,
        orgId,
        gasCardSpend: Math.round(gas * 100) / 100,
        driverSpend: Math.round(cash * 100) / 100,
        fuelRule,
        categoryCosts: {
          rideShareCost: Number.isFinite(rideShareCost) ? rideShareCost : null,
          companyUsageCost: Number(report.companyUsageCost) || 0,
          deadheadCost: Number(report.deadheadCost) || 0,
          personalUsageCost: Number(report.personalUsageCost) || 0,
          miscellaneousCost: Number(report.miscellaneousCost) || 0,
        },
        metadata: {
          ...meta,
          settledEntries: mine.map((entry) => ({
            id: entry.id,
            amount: entry.amount,
            date: ymd(entry.date),
            driverId: entry.driverId || driverId,
            vehicleId: entry.vehicleId || report.vehicleId,
          })),
        },
      };
    });

    const withSpend = stamped.filter((report) => Math.abs(Number(report.totalGasCardCost) || 0) > 0.009);
    if (withSpend.some((report) => {
      const cats = (report as { categoryCosts?: { rideShareCost?: number | null } }).categoryCosts;
      return !cats || !Number.isFinite(Number(cats.rideShareCost));
    })) {
      return { ok: false, reports: [], totalSpend: 0, error: "missing_category_costs" };
    }

    const totalSpend = Math.round(
      stamped.reduce((sum, report) => sum + (Number(report.totalGasCardCost) || 0), 0) * 100,
    ) / 100;
    return { ok: true, reports: stamped as unknown as Record<string, unknown>[], totalSpend };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[fuel_week_prepare] failed", orgId, weekStart, message);
    return { ok: false, reports: [], totalSpend: 0, error: message || "fuel week compute failed" };
  }
}
