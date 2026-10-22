/**
 * Week-scoped deadhead. Never scans the whole fleet history.
 */
import { queryFleet } from "./repos/baseRepo.ts";
import { getServiceClient } from "./service_client.ts";
import * as fuelLogic from "./fuel_logic.ts";

export class FuelDistanceReadError extends Error {
  degraded: string[];
  constructor(message: string, degraded: string[]) {
    super(message);
    this.name = "FuelDistanceReadError";
    this.degraded = degraded;
  }
}

function ymd(value: string | undefined): string | undefined {
  const day = String(value || "").split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

function shiftYmd(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function queryPages(
  domain: "trips" | "fuel_entries" | "vehicles",
  opts: Record<string, unknown>,
  failedInput: string,
): Promise<any[]> {
  const page = 1000;
  const out: any[] = [];
  let offset = 0;
  for (;;) {
    const res = await queryFleet(domain, { ...opts, limit: page, offset } as any);
    if (res.error) throw new FuelDistanceReadError(res.error.message, [failedInput]);
    const rows = res.data || [];
    out.push(...rows);
    if (rows.length < page) break;
    offset += rows.length;
    if (offset > 50000) break;
  }
  return out;
}

function recordId(row: any): string {
  return String(row?.id || row?.tripId || "");
}

async function loadBrainPolicy(): Promise<Partial<fuelLogic.DeadheadBrainPolicy>> {
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("fuel_brain_policies")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();
    if (error || !data) return {};
    return {
      deadheadGapMaxMinutes: Number(data.deadhead_gap_max_minutes) || undefined,
      personalGapMinMinutes: Number(data.personal_gap_min_minutes) || undefined,
      peakHoursStart: Number(data.peak_hours_start),
      peakHoursEnd: Number(data.peak_hours_end),
      industryFallbackPct: Number(data.industry_fallback_pct) || undefined,
      crossValidationPp: Number(data.cross_validation_pp) || undefined,
      preferOdoGaps: data.prefer_odo_gaps !== false,
      ambiguousDeadheadSplitPct: Number(data.ambiguous_deadhead_split_pct) || undefined,
    };
  } catch {
    return {};
  }
}

function inWindow(row: any, periodStart?: string, periodEnd?: string): boolean {
  if (!periodStart && !periodEnd) return true;
  const dateStr = row?.date || row?.timestamp || row?.requestTime;
  if (!dateStr) return true;
  const ms = new Date(dateStr).getTime();
  if (Number.isNaN(ms)) return true;
  const startMs = periodStart ? new Date(periodStart).getTime() : 0;
  const endMs = periodEnd ? new Date(`${periodEnd}T23:59:59.999Z`).getTime() : Infinity;
  return ms >= startMs && ms <= endMs;
}

export async function computeFleetDeadhead(args: {
  orgId: string;
  periodStart?: string;
  periodEnd?: string;
  vehicleIds?: string[];
}): Promise<{ fleet: Record<string, unknown>; vehicles: any[] }> {
  const started = Date.now();
  const periodStart = ymd(args.periodStart);
  const periodEnd = ymd(args.periodEnd);
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = periodStart || shiftYmd(today, -35);
  const windowEnd = periodEnd || today;
  const vehicleIds = [...new Set((args.vehicleIds || []).map((id) => String(id).trim()).filter(Boolean))];

  const vehicles = vehicleIds.length
    ? await queryPages("vehicles", { org: args.orgId, in: { id: vehicleIds } }, "vehicles")
    : await queryPages("vehicles", { org: args.orgId }, "vehicles");

  const ids = vehicles.map((v) => String(v.id || "")).filter(Boolean);
  const driverIds = [
    ...new Set(vehicles.map((v) => String(v.currentDriverId || "")).filter(Boolean)),
  ];

  const tripByVehicle = ids.length
    ? await queryPages(
      "trips",
      {
        org: args.orgId,
        dateFrom: shiftYmd(windowStart, -1),
        dateTo: shiftYmd(windowEnd, 1),
        in: { vehicle_id: ids },
      },
      "trips",
    )
    : [];
  const tripByDriver = driverIds.length
    ? await queryPages(
      "trips",
      {
        org: args.orgId,
        dateFrom: shiftYmd(windowStart, -1),
        dateTo: shiftYmd(windowEnd, 1),
        in: { driver_id: driverIds },
      },
      "trips",
    )
    : [];
  const tripsById = new Map<string, any>();
  for (const trip of [...tripByVehicle, ...tripByDriver]) {
    const id = recordId(trip);
    if (id) tripsById.set(id, trip);
  }
  const allTrips = [...tripsById.values()];

  const fills = ids.length
    ? await queryPages(
      "fuel_entries",
      {
        org: args.orgId,
        dateFrom: shiftYmd(windowStart, -60),
        dateTo: shiftYmd(windowEnd, 1),
        in: { vehicle_id: ids },
      },
      "fuel",
    )
    : [];

  const brainPolicy = await loadBrainPolicy();
  const vehicleResults: any[] = [];
  for (const vehicle of vehicles) {
    if (!vehicle.id) continue;
    const tripIds = new Set<string>();
    const vTrips: any[] = [];
    for (const trip of allTrips) {
      const matchesVehicle =
        trip.vehicleId === vehicle.id ||
        trip.vehicleId === vehicle.licensePlate ||
        trip.vehicleId === vehicle.plateNumber;
      const matchesDriver = vehicle.currentDriverId && trip.driverId === vehicle.currentDriverId;
      const id = recordId(trip);
      if (!(matchesVehicle || matchesDriver) || (id && tripIds.has(id))) continue;
      if (id) tripIds.add(id);
      vTrips.push(trip);
    }
    const vEntries = fills.filter((entry) => entry.vehicleId === vehicle.id);
    const prior = vEntries
      .filter((entry) => periodStart && String(entry.date || "").slice(0, 10) < periodStart)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    const weekEntries = vEntries.filter((entry) => inWindow(entry, periodStart, periodEnd));
    const fuelEntries = prior ? [...weekEntries, prior] : weekEntries;
    const attribution = fuelLogic.calculateDeadheadAttribution({
      vehicleId: vehicle.id,
      fuelEntries,
      trips: vTrips.filter((trip) => inWindow(trip, periodStart, periodEnd)),
      periodStart,
      periodEnd,
      policy: brainPolicy,
    });
    const odoFills = [...fuelEntries]
      .filter((entry) => Number(entry.odometer) > 0)
      .sort((a, b) => Number(a.odometer) - Number(b.odometer));
    const endFill = odoFills[odoFills.length - 1];
    vehicleResults.push({
      ...attribution,
      priorOdometer: prior ? Number(prior.odometer) || 0 : 0,
      priorAt: prior ? String(prior.date || prior.time || "") : "",
      spanEndAt: endFill ? String(endFill.date || "") : "",
      vehicleName: vehicle.name || vehicle.licensePlate || vehicle.plateNumber || vehicle.id,
    });
  }

  const fleetSummary = {
    vehicleCount: vehicleResults.length,
    totalOdometerKm: 0,
    totalTripKm: 0,
    totalDeadheadKm: 0,
    totalPersonalKm: 0,
    totalUnaccountedKm: 0,
    fleetDeadheadPct: 0,
    fleetPersonalPct: 0,
    avgConfidence: "" as string,
    methodBreakdown: { A: 0, C: 0, combined: 0, fallback: 0 } as Record<string, number>,
  };
  for (const row of vehicleResults) {
    fleetSummary.totalOdometerKm += row.totalOdometerKm || 0;
    fleetSummary.totalTripKm += row.tripKm || 0;
    fleetSummary.totalDeadheadKm += row.deadheadKm || 0;
    fleetSummary.totalPersonalKm += row.personalKm || 0;
    fleetSummary.totalUnaccountedKm += row.unaccountedKm || 0;
    fleetSummary.methodBreakdown[row.method] = (fleetSummary.methodBreakdown[row.method] || 0) + 1;
  }
  if (fleetSummary.totalOdometerKm > 0) {
    fleetSummary.fleetDeadheadPct = Number(
      ((fleetSummary.totalDeadheadKm / fleetSummary.totalOdometerKm) * 100).toFixed(1),
    );
    fleetSummary.fleetPersonalPct = Number(
      ((fleetSummary.totalPersonalKm / fleetSummary.totalOdometerKm) * 100).toFixed(1),
    );
  }
  const confCounts = { high: 0, medium: 0, low: 0 };
  for (const row of vehicleResults) {
    const level = row.confidenceLevel as "high" | "medium" | "low";
    if (level in confCounts) confCounts[level] += 1;
  }
  fleetSummary.avgConfidence =
    confCounts.high >= confCounts.medium && confCounts.high >= confCounts.low
      ? "high"
      : confCounts.medium >= confCounts.low
        ? "medium"
        : "low";

  console.log(
    `[deadhead/fleet] Completed vehicles=${vehicleResults.length} entries=${fills.length} trips=${allTrips.length} elapsedMs=${Date.now() - started}`,
  );
  return { fleet: fleetSummary, vehicles: vehicleResults };
}
