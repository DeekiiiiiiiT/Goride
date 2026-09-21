/**
 * G16 — attribute fuel/toll/expense rows to rideshare vs rush_delivery.
 * Fuel Phase 0: T0–T5 ladder + sticky explicit (see FUEL_SERVICE_LINE_SPLIT_AUDIT.md §3.1).
 */
import * as kv from "./kv_store.tsx";

export type ServiceLine = "rideshare" | "rush_delivery";

/** Attribution provenance — never invent a fourth vocabulary. */
export type ServiceLineSource =
  | "program"
  | "explicit"
  | "trip"
  | "vehicle"
  | "driver"
  | "unattributed";

export type ResolvedFuelServiceLine = {
  /** Null when source is unattributed — conservation bucket, not a guess. */
  serviceLine: ServiceLine | null;
  source: ServiceLineSource;
};

export function inferTripServiceLine(trip: Record<string, unknown>): ServiceLine {
  const explicit = trip.serviceLine ?? trip.service_line;
  if (explicit === "rush_delivery" || explicit === "rideshare") return explicit;
  if (String(trip.platform ?? "") === "Roam Rush") return "rush_delivery";
  return "rideshare";
}

export function inferServiceLineFromTripId(
  trip: Record<string, unknown> | null | undefined,
): ServiceLine | null {
  if (!trip) return null;
  return inferTripServiceLine(trip);
}

function isServiceLine(v: unknown): v is ServiceLine {
  return v === "rideshare" || v === "rush_delivery";
}

function isServiceLineSource(v: unknown): v is ServiceLineSource {
  return (
    v === "program" ||
    v === "explicit" ||
    v === "trip" ||
    v === "vehicle" ||
    v === "driver" ||
    v === "unattributed"
  );
}

function normalizeLines(raw: unknown): ServiceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ServiceLine[] = [];
  for (const x of raw) {
    if (isServiceLine(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

export type ResolveFuelServiceLineInput = {
  /** Existing attribution on the row (sticky when source=explicit). */
  existingLine?: unknown;
  existingSource?: unknown;
  /** T0 — dedicated JAA/program line when known. */
  programServiceLine?: unknown;
  /** T2 — linked trip's line. */
  tripServiceLine?: unknown;
  /** T3 — vehicle.service_lines / serviceLines. */
  vehicleServiceLines?: unknown;
  /** T4 — driver/courier serviceLines. */
  driverServiceLines?: unknown;
};

/**
 * Pure T0–T5 ladder. Attribution never guesses; dual-line → unattributed.
 * T1 explicit is sticky — callers must not overwrite without an explicit write path.
 */
export function resolveFuelEntryServiceLine(
  input: ResolveFuelServiceLineInput,
): ResolvedFuelServiceLine {
  const existingSource = isServiceLineSource(input.existingSource)
    ? input.existingSource
    : null;
  const existingLine = isServiceLine(input.existingLine) ? input.existingLine : null;

  // T1 sticky
  if (existingSource === "explicit" && existingLine) {
    return { serviceLine: existingLine, source: "explicit" };
  }

  // T0 program
  if (isServiceLine(input.programServiceLine)) {
    return { serviceLine: input.programServiceLine, source: "program" };
  }

  // T2 trip
  if (isServiceLine(input.tripServiceLine)) {
    return { serviceLine: input.tripServiceLine, source: "trip" };
  }

  // T3 vehicle — exactly one line
  const vehicleLines = normalizeLines(input.vehicleServiceLines);
  if (vehicleLines.length === 1) {
    return { serviceLine: vehicleLines[0], source: "vehicle" };
  }

  // T4 driver — exactly one line
  const driverLines = normalizeLines(input.driverServiceLines);
  if (driverLines.length === 1) {
    return { serviceLine: driverLines[0], source: "driver" };
  }

  // T5 — work queue, not a failure
  return { serviceLine: null, source: "unattributed" };
}

/** Apply resolved attribution onto a KV/cost record (snake + camel). */
export function applyServiceLineResolution(
  record: Record<string, unknown>,
  resolved: ResolvedFuelServiceLine,
  opts?: { setBy?: string | null; setAt?: string | null },
): Record<string, unknown> {
  const line = resolved.serviceLine;
  record.service_line = line;
  record.serviceLine = line;
  record.service_line_source = resolved.source;
  record.serviceLineSource = resolved.source;

  if (resolved.source === "explicit") {
    const at = opts?.setAt ?? new Date().toISOString();
    record.service_line_set_at = at;
    record.serviceLineSetAt = at;
    if (opts?.setBy) {
      record.service_line_set_by = opts.setBy;
      record.serviceLineSetBy = opts.setBy;
    }
  }

  const meta = (record.metadata as Record<string, unknown>) || {};
  record.metadata = {
    ...meta,
    service_line: line,
    serviceLine: line,
    service_line_source: resolved.source,
    serviceLineSource: resolved.source,
  };
  return record;
}

/**
 * Mark a human override (T1). Call from Review Queue / bulk set — not from auto-resolve.
 */
export function setExplicitServiceLine(
  record: Record<string, unknown>,
  line: ServiceLine,
  setBy?: string | null,
): Record<string, unknown> {
  return applyServiceLineResolution(
    record,
    { serviceLine: line, source: "explicit" },
    { setBy: setBy ?? null },
  );
}

/** Stamp service_line on a cost KV record when a linked trip is known (legacy T2 helper). */
export async function stampServiceLineFromTripLink(
  record: Record<string, unknown>,
  opts?: { tripId?: string | null; trip?: Record<string, unknown> | null },
): Promise<Record<string, unknown>> {
  const existingSource = record.service_line_source ?? record.serviceLineSource;
  if (existingSource === "explicit") return record;

  const existing = record.service_line ?? record.serviceLine;
  if (existing === "rush_delivery" || existing === "rideshare") {
    if (!isServiceLineSource(existingSource)) {
      record.service_line_source = "trip";
      record.serviceLineSource = "trip";
    }
    return record;
  }

  let trip = opts?.trip;
  const tripId =
    opts?.tripId ??
    record.tripId ??
    record.trip_id ??
    (record.metadata as Record<string, unknown> | undefined)?.tripId;

  if (!trip && tripId) {
    trip = (await kv.get(`trip:${tripId}`)) as Record<string, unknown> | null;
    if (!trip) trip = (await kv.get(`fleet_trip:${tripId}`)) as Record<string, unknown> | null;
  }

  const line = inferServiceLineFromTripId(trip);
  if (!line) return record;

  return applyServiceLineResolution(record, { serviceLine: line, source: "trip" });
}

/** Shared kv.get memo for batch stamps (S6). */
export type ServiceLineLookupCache = {
  get: (key: string) => Promise<unknown>;
};

export function createServiceLineLookupCache(): ServiceLineLookupCache {
  const memo = new Map<string, Promise<unknown>>();
  return {
    get(key: string) {
      let p = memo.get(key);
      if (!p) {
        p = kv.get(key);
        memo.set(key, p);
      }
      return p;
    },
  };
}

async function cachedGet(
  key: string,
  cache?: ServiceLineLookupCache,
): Promise<unknown> {
  if (cache) return cache.get(key);
  return kv.get(key);
}

async function loadTripServiceLine(
  record: Record<string, unknown>,
  cache?: ServiceLineLookupCache,
): Promise<ServiceLine | null> {
  const meta = (record.metadata as Record<string, unknown>) || {};
  const tripId =
    record.tripId ??
    record.trip_id ??
    meta.tripId ??
    meta.linkedTripId ??
    meta.originalTransactionId;
  if (!tripId) return null;
  let trip = (await cachedGet(`trip:${tripId}`, cache)) as Record<string, unknown> | null;
  if (!trip) {
    trip = (await cachedGet(`fleet_trip:${String(tripId)}`, cache)) as Record<string, unknown> | null;
  }
  return inferServiceLineFromTripId(trip);
}

async function loadProgramServiceLine(
  record: Record<string, unknown>,
  cache?: ServiceLineLookupCache,
): Promise<ServiceLine | null> {
  const direct =
    record.programServiceLine ??
    record.program_service_line ??
    record.dedicatedServiceLine ??
    record.dedicated_service_line;
  if (isServiceLine(direct)) return direct;

  const cardId = record.cardId ?? record.card_id;
  if (!cardId) return null;
  const card = (await cachedGet(`fuel_card:${String(cardId)}`, cache)) as Record<
    string,
    unknown
  > | null;
  if (!card) return null;
  const fromCard =
    card.dedicatedServiceLine ??
    card.dedicated_service_line ??
    card.programServiceLine ??
    card.program_service_line ??
    card.serviceLine ??
    card.service_line;
  return isServiceLine(fromCard) ? fromCard : null;
}

async function loadVehicleServiceLines(
  record: Record<string, unknown>,
  cache?: ServiceLineLookupCache,
): Promise<ServiceLine[]> {
  const vehicleId = record.vehicleId ?? record.vehicle_id;
  if (!vehicleId) return [];
  const vehicle = (await cachedGet(`vehicle:${String(vehicleId)}`, cache)) as Record<
    string,
    unknown
  > | null;
  if (!vehicle) return [];
  return normalizeLines(vehicle.serviceLines ?? vehicle.service_lines);
}

async function loadDriverServiceLines(
  record: Record<string, unknown>,
  cache?: ServiceLineLookupCache,
): Promise<ServiceLine[]> {
  const driverId = record.driverId ?? record.driver_id;
  if (!driverId) return [];
  const driver = (await cachedGet(`driver:${String(driverId)}`, cache)) as Record<
    string,
    unknown
  > | null;
  if (!driver) return [];
  return normalizeLines(driver.serviceLines ?? driver.service_lines);
}

/** S4 — stamp failure path: distinguishable from legacy NULL source. */
export function markCostRowUnattributedOnStampFailure(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return applyServiceLineResolution(record, { serviceLine: null, source: "unattributed" });
}

/**
 * Resolve + stamp service line on a fuel_entry / expense_journal record.
 * Safe to call on every write: never overwrites source=explicit.
 */
export async function ensureCostRowServiceLine(
  record: Record<string, unknown>,
  opts?: { lookupCache?: ServiceLineLookupCache },
): Promise<Record<string, unknown>> {
  if (!record || typeof record !== "object") return record;

  const existingSource = record.service_line_source ?? record.serviceLineSource;
  // Sticky explicit — no force override (S5 removed inert force param).
  if (existingSource === "explicit") {
    const line = record.service_line ?? record.serviceLine;
    if (isServiceLine(line)) {
      record.service_line = line;
      record.serviceLine = line;
      record.service_line_source = "explicit";
      record.serviceLineSource = "explicit";
    }
    return record;
  }

  const cache = opts?.lookupCache;
  const [programServiceLine, tripServiceLine, vehicleServiceLines, driverServiceLines] =
    await Promise.all([
      loadProgramServiceLine(record, cache),
      loadTripServiceLine(record, cache),
      loadVehicleServiceLines(record, cache),
      loadDriverServiceLines(record, cache),
    ]);

  const resolved = resolveFuelEntryServiceLine({
    existingLine: record.service_line ?? record.serviceLine,
    existingSource,
    programServiceLine,
    tripServiceLine,
    vehicleServiceLines,
    driverServiceLines,
  });

  return applyServiceLineResolution(record, resolved);
}

/** Alias used by fuel write paths / docs. */
export const ensureFuelEntryServiceLine = ensureCostRowServiceLine;

/**
 * Idempotent re-resolve for an in-memory fuel/expense row.
 * Never overwrites explicit. Returns whether the resolution changed.
 */
export async function reResolveCostRowServiceLine(
  record: Record<string, unknown>,
): Promise<{ record: Record<string, unknown>; changed: boolean }> {
  const beforeLine = record.service_line ?? record.serviceLine;
  const beforeSource = record.service_line_source ?? record.serviceLineSource;
  const next = await ensureCostRowServiceLine(record);
  const afterLine = next.service_line ?? next.serviceLine;
  const afterSource = next.service_line_source ?? next.serviceLineSource;
  const changed = beforeLine !== afterLine || beforeSource !== afterSource;
  return { record: next, changed };
}

export type TripMixAllocation = {
  rideshareTrips: number;
  rushDeliveryTrips: number;
  ratio: { rideshare: number; rush_delivery: number };
};

/** Weekly trip-mix ratio for pro-rata shared vehicle costs (G16). Reporting only — Phase 4. */
export function allocateSharedCostsByTripMix(
  trips: Array<Record<string, unknown>>,
  periodAnchor: string,
  periodEnd: string,
  dayOfTrip: (trip: Record<string, unknown>) => string | null,
): TripMixAllocation {
  let rideshareTrips = 0;
  let rushDeliveryTrips = 0;

  for (const trip of trips || []) {
    const d = dayOfTrip(trip);
    if (!d || d < periodAnchor || d > periodEnd) continue;
    const st = String(trip.status ?? "").toLowerCase();
    if (st.includes("cancel")) continue;
    if (inferTripServiceLine(trip) === "rush_delivery") rushDeliveryTrips++;
    else rideshareTrips++;
  }

  const total = rideshareTrips + rushDeliveryTrips;
  if (total === 0) {
    return {
      rideshareTrips: 0,
      rushDeliveryTrips: 0,
      ratio: { rideshare: 1, rush_delivery: 0 },
    };
  }

  return {
    rideshareTrips,
    rushDeliveryTrips,
    ratio: {
      rideshare: rideshareTrips / total,
      rush_delivery: rushDeliveryTrips / total,
    },
  };
}
