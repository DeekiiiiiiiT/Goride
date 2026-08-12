/**
 * Canonical odometer ledger — single mileage event log + derived current km.
 * Source systems (fuel / check-in / service / manual) project into fleet.odometer_readings.
 */
import * as kv from "./kv_store.tsx";
import { fleetDb, fleetTable, rowToKvValue } from "./repos/baseRepo.ts";
import { getFleetTimezone, hasTzSuffix, naiveToUtc } from "./timezone_helper.tsx";

export type OdometerLedgerSource =
  | "manual"
  | "fuel"
  | "checkin"
  | "service"
  | "import"
  | "correction";

export type OdometerReferenceType =
  | "fuel_entry"
  | "checkin"
  | "maintenance_log"
  | "manual"
  | "import_batch"
  | "correction";

export type ProjectOdometerInput = {
  organizationId?: string | null;
  vehicleId: string;
  reading: number;
  source: OdometerLedgerSource;
  referenceId: string;
  referenceType: OdometerReferenceType;
  recordedAt?: string | null;
  readingDate?: string | null;
  driverId?: string | null;
  isHard?: boolean;
  isVerified?: boolean;
  notes?: string | null;
  imageUrl?: string | null;
  payloadExtra?: Record<string, unknown>;
  anomalyThresholdKm?: number;
};

export type CurrentOdometer = {
  km: number;
  source: string | null;
  recordedAt: string | null;
  readingId: string | null;
  vehicleId: string;
  isVerified: boolean;
};

export type LedgerListFilters = {
  source?: string | null;
  from?: string | null;
  to?: string | null;
  includeVoided?: boolean;
  anomaliesOnly?: boolean;
  limit?: number;
  offset?: number;
};

const TABLE = () => fleetTable("odometer_readings");
const REGRESSION_THRESHOLD_DEFAULT = 50;

function ymd(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  const s = String(isoOrDate).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

/**
 * Combine fuel date + optional time into a real UTC instant.
 * Naive fuel wall-clock (no Z) is Jamaica/fleet local — never stamp as UTC Z.
 * Multi-currency / multi-TZ unlock later; clock truth is getFleetTimezone().
 */
export async function resolveFuelRecordedAt(
  entry: Record<string, unknown>,
): Promise<string | null> {
  const dateRaw = String(entry.date || entry.recordedAt || "").trim();
  const timeRaw = String(entry.time || "").trim();
  if (!dateRaw) return null;

  const tz = await getFleetTimezone();

  // Already timezone-aware (check-in style / true UTC)
  if (hasTzSuffix(dateRaw)) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // Naive ISO with clock in the date field → interpret as fleet local
  if (/T\d{1,2}:\d{2}/.test(dateRaw)) {
    const d = naiveToUtc(dateRaw.replace(" ", "T"), tz);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const day = ymd(dateRaw);
  if (!day) return null;

  const tm = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tm) {
    const hh = String(Number(tm[1])).padStart(2, "0");
    const mm = String(Number(tm[2])).padStart(2, "0");
    const ss = String(Number(tm[3] ?? 0)).padStart(2, "0");
    const d = naiveToUtc(`${day}T${hh}:${mm}:${ss}`, tz);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // Date-only: noon fleet-local so morning fills still sort earlier than "mystery" day anchors
  const d = naiveToUtc(`${day}T12:00:00`, tz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ledgerId(vehicleId: string, source: string, referenceId: string): string {
  return `${source}_${referenceId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180) ||
    crypto.randomUUID();
}

function legacyKey(vehicleId: string, id: string): string {
  return `odometer_reading:${vehicleId}:${id}`;
}

function toClientValue(row: Record<string, unknown>): Record<string, unknown> {
  const v = rowToKvValue(row);
  const reading = Number(v.value ?? v.reading ?? row.reading ?? 0) || 0;
  const source = String(v.source || row.source || "manual");
  const uiSource =
    source === "fuel"
      ? "fuel"
      : source === "checkin"
        ? "checkin"
        : source === "service"
          ? "service"
          : "manual";
  // Column recorded_at is source of truth (payload may still hold pre-Jamaica-fix stamps)
  const recordedAt =
    row.recorded_at != null ? String(row.recorded_at) : (v.recordedAt != null ? String(v.recordedAt) : null);
  return {
    ...v,
    id: v.id || row.id,
    vehicleId: v.vehicleId || row.vehicle_id,
    value: reading,
    reading,
    odometer: reading,
    date: v.date || row.reading_date || (recordedAt ? String(recordedAt).slice(0, 10) : null),
    recordedAt,
    source: uiSource,
    ledgerSource: source,
    referenceId: v.referenceId || row.reference_id,
    referenceType: v.referenceType || row.reference_type,
    type: v.type || (row.is_hard === false ? "Calculated" : "Hard"),
    isVerified: !!(v.isVerified ?? row.is_verified),
    isVoided: !!(v.isVoided ?? row.is_voided),
    isAnomaly: !!(v.isAnomaly ?? row.is_anomaly),
    isHard: row.is_hard !== false,
    isAnchorPoint: !!(v.isVerified ?? row.is_verified) || source === "fuel" || source === "service",
    driverId: v.driverId || row.driver_id,
    notes: v.notes,
    createdAt: recordedAt || v.createdAt || row.created_at,
  };
}

export async function getCurrentOdometer(vehicleId: string): Promise<CurrentOdometer> {
  const vid = String(vehicleId || "").trim();
  if (!vid || vid === "unknown") {
    return { km: 0, source: null, recordedAt: null, readingId: null, vehicleId: vid, isVerified: false };
  }

  const { data, error } = await fleetDb()
    .from(TABLE())
    .select("*")
    .eq("vehicle_id", vid)
    .eq("is_voided", false)
    .eq("is_hard", true)
    .not("reading", "is", null)
    .gt("reading", 0)
    .order("reading", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return { km: 0, source: null, recordedAt: null, readingId: null, vehicleId: vid, isVerified: false };
  }
  const row = data as Record<string, unknown>;
  return {
    km: Number(row.reading) || 0,
    source: row.source != null ? String(row.source) : null,
    recordedAt: row.recorded_at != null ? String(row.recorded_at) : null,
    readingId: row.id != null ? String(row.id) : null,
    vehicleId: vid,
    isVerified: !!row.is_verified,
  };
}

export async function listOdometerLedger(
  vehicleId: string,
  filters: LedgerListFilters = {},
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const vid = String(vehicleId || "").trim();
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);
  const offset = Math.max(filters.offset ?? 0, 0);

  let q = fleetDb()
    .from(TABLE())
    .select("*", { count: "exact" })
    .eq("vehicle_id", vid);

  if (!filters.includeVoided) q = q.eq("is_voided", false);
  if (filters.anomaliesOnly) q = q.eq("is_anomaly", true);
  if (filters.source) {
    const s = String(filters.source);
    if (s === "manual") {
      q = q.in("source", ["manual", "import", "correction"]);
    } else {
      q = q.eq("source", s);
    }
  }
  if (filters.from) q = q.gte("recorded_at", `${ymd(filters.from)}T00:00:00.000Z`);
  if (filters.to) q = q.lte("recorded_at", `${ymd(filters.to)}T23:59:59.999Z`);

  const { data, error, count } = await q
    .order("recorded_at", { ascending: false })
    .order("reading", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  const rows = (data || []).map((r) => toClientValue(r as Record<string, unknown>));

  for (let i = 0; i < rows.length; i++) {
    const newer = Number(rows[i].value) || 0;
    const older = i + 1 < rows.length ? Number(rows[i + 1].value) || 0 : null;
    rows[i].deltaKm = older != null ? newer - older : null;
  }

  return { data: rows, total: count ?? rows.length };
}

export async function projectOdometerReading(
  input: ProjectOdometerInput,
): Promise<Record<string, unknown>> {
  const vehicleId = String(input.vehicleId || "").trim();
  if (!vehicleId || vehicleId === "unknown") {
    throw new Error("vehicleId required for odometer ledger projection");
  }
  const reading = Number(input.reading);
  if (!Number.isFinite(reading) || reading <= 0) {
    throw new Error("odometer reading must be a positive number");
  }

  const source = input.source;
  const referenceId = String(input.referenceId || "").trim();
  if (!referenceId) throw new Error("referenceId required for odometer ledger projection");

  const recordedAt =
    input.recordedAt ||
    (input.readingDate ? `${ymd(input.readingDate)}T12:00:00.000Z` : null) ||
    new Date().toISOString();
  const readingDate = ymd(input.readingDate) || ymd(recordedAt) || new Date().toISOString().slice(0, 10);
  const id = ledgerId(vehicleId, source, referenceId);
  const key = legacyKey(vehicleId, id);

  const current = await getCurrentOdometer(vehicleId);
  const threshold = input.anomalyThresholdKm ?? REGRESSION_THRESHOLD_DEFAULT;
  const isAnomaly = current.km > 0 && reading < current.km - threshold;

  const payload: Record<string, unknown> = {
    id,
    vehicleId,
    value: reading,
    reading,
    odometer: reading,
    date: readingDate,
    recordedAt,
    source,
    ledgerSource: source,
    referenceId,
    referenceType: input.referenceType,
    type: input.isHard === false ? "Calculated" : "Hard",
    isHard: input.isHard !== false,
    isVerified: !!input.isVerified,
    isVoided: false,
    isAnomaly,
    driverId: input.driverId || null,
    notes: input.notes || null,
    imageUrl: input.imageUrl || null,
    organizationId: input.organizationId || null,
    createdAt: recordedAt,
    ...(input.payloadExtra || {}),
  };

  await kv.set(key, payload);

  await fleetDb()
    .from(TABLE())
    .upsert(
      {
        id,
        organization_id: input.organizationId || null,
        vehicle_id: vehicleId,
        reading,
        reading_date: readingDate,
        source,
        reference_id: referenceId,
        reference_type: input.referenceType,
        recorded_at: recordedAt,
        is_hard: input.isHard !== false,
        is_verified: !!input.isVerified,
        is_voided: false,
        is_anomaly: isAnomaly,
        void_reason: null,
        driver_id: input.driverId || null,
        legacy_kv_id: key,
        payload_json: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  try {
    await refreshVehicleOdometerCache(vehicleId);
  } catch (e) {
    console.warn("[odometer_ledger] cache refresh failed:", vehicleId, e);
  }

  return payload;
}

export async function voidOdometerReading(
  idOrRef: { id?: string; vehicleId?: string; source?: string; referenceId?: string },
  reason: string,
): Promise<void> {
  let id = idOrRef.id;
  if (!id && idOrRef.vehicleId && idOrRef.source && idOrRef.referenceId) {
    id = ledgerId(idOrRef.vehicleId, idOrRef.source, idOrRef.referenceId);
  }
  if (!id) throw new Error("voidOdometerReading requires id or vehicle/source/reference");

  const { data: existing, error } = await fleetDb().from(TABLE()).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) return;

  const row = existing as Record<string, unknown>;
  const vehicleId = String(row.vehicle_id || "");
  const payload = {
    ...(typeof row.payload_json === "object" && row.payload_json
      ? (row.payload_json as Record<string, unknown>)
      : {}),
    isVoided: true,
    voidReason: reason,
  };
  const key = String(row.legacy_kv_id || legacyKey(vehicleId, id));

  await fleetDb()
    .from(TABLE())
    .update({
      is_voided: true,
      void_reason: reason,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  try {
    await kv.set(key, { ...payload, id, vehicleId, isVoided: true, voidReason: reason });
  } catch {
    /* payload mirror best-effort */
  }

  if (vehicleId) {
    try {
      await refreshVehicleOdometerCache(vehicleId);
    } catch (e) {
      console.warn("[odometer_ledger] cache refresh after void failed:", vehicleId, e);
    }
  }
}

export async function refreshVehicleOdometerCache(vehicleId: string): Promise<CurrentOdometer> {
  const current = await getCurrentOdometer(vehicleId);
  const vehicle = await kv.get(`vehicle:${vehicleId}`);
  if (vehicle && typeof vehicle === "object") {
    const metrics = {
      ...((vehicle as any).metrics && typeof (vehicle as any).metrics === "object"
        ? (vehicle as any).metrics
        : {}),
      odometer: current.km,
      odometerSource: current.source,
      odometerUpdatedAt: current.recordedAt || new Date().toISOString(),
    };
    await kv.set(`vehicle:${vehicleId}`, {
      ...vehicle,
      metrics,
      currentOdometer: current.km,
    });
  }
  return current;
}

export async function projectFromFuelEntry(
  entry: Record<string, unknown>,
  organizationId?: string | null,
) {
  const odo = Number(entry.odometer);
  if (!Number.isFinite(odo) || odo <= 0) return null;
  const vehicleId = String(entry.vehicleId || "").trim();
  if (!vehicleId || vehicleId === "unknown") return null;
  const id = String(entry.id || "").trim();
  if (!id) return null;
  return projectOdometerReading({
    organizationId: organizationId || (entry.organizationId as string) || null,
    vehicleId,
    reading: odo,
    source: "fuel",
    referenceId: id,
    referenceType: "fuel_entry",
    recordedAt: await resolveFuelRecordedAt(entry),
    readingDate: ymd(entry.date as string),
    driverId: (entry.driverId as string) || null,
    isHard: true,
    isVerified: true,
    notes: entry.location ? `Fuel at ${entry.location}` : "Fuel Entry",
    imageUrl:
      (entry.odometerImageUrl as string) ||
      (entry.odometerProofUrl as string) ||
      (entry.receiptUrl as string) ||
      null,
    payloadExtra: { metaData: entry.metadata || {}, time: entry.time || null },
  });
}

export async function projectFromCheckIn(
  checkIn: Record<string, unknown>,
  organizationId?: string | null,
) {
  const odo = Number(checkIn.odometer);
  if (!Number.isFinite(odo) || odo <= 0) return null;
  const vehicleId = String(checkIn.vehicleId || "").trim();
  if (!vehicleId || vehicleId === "unknown") return null;
  const id = String(checkIn.id || "").trim();
  if (!id) return null;
  const verified =
    checkIn.verified === true ||
    checkIn.isVerified === true ||
    checkIn.reviewStatus === "approved" ||
    checkIn.reviewStatus === "auto_approved";
  return projectOdometerReading({
    organizationId: organizationId || (checkIn.organizationId as string) || null,
    vehicleId,
    reading: odo,
    source: "checkin",
    referenceId: id,
    referenceType: "checkin",
    recordedAt: (checkIn.timestamp as string) || null,
    readingDate: ymd((checkIn.timestamp as string) || (checkIn.weekStart as string)),
    driverId: (checkIn.driverId as string) || null,
    isHard: true,
    isVerified: !!verified,
    notes: checkIn.weekStart ? `Weekly Check-in (Week: ${checkIn.weekStart})` : "Weekly Check-in",
    imageUrl: (checkIn.photoUrl as string) || (checkIn.imageUrl as string) || null,
    payloadExtra: {
      weekStart: checkIn.weekStart,
      reviewStatus: checkIn.reviewStatus,
      method: checkIn.method,
    },
  });
}

export async function projectFromMaintenanceLog(
  log: Record<string, unknown>,
  organizationId?: string | null,
) {
  const odo = Number(log.odometer ?? log.odometerReading ?? log.mileage);
  if (!Number.isFinite(odo) || odo <= 0) return null;
  const vehicleId = String(log.vehicleId || log.licensePlate || "").trim();
  if (!vehicleId || vehicleId === "unknown") return null;
  const id = String(log.id || "").trim();
  if (!id) return null;
  return projectOdometerReading({
    organizationId: organizationId || (log.organizationId as string) || null,
    vehicleId,
    reading: odo,
    source: "service",
    referenceId: id,
    referenceType: "maintenance_log",
    recordedAt: (log.date as string) || (log.completedAt as string) || null,
    readingDate: ymd((log.date as string) || (log.completedAt as string)),
    driverId: (log.driverId as string) || null,
    isHard: true,
    isVerified: true,
    notes: (log.serviceType as string) || (log.description as string) || "Service Log",
  });
}

export async function backfillOdometerLedger(opts?: {
  dryRun?: boolean;
  organizationId?: string | null;
}): Promise<Record<string, number>> {
  const dryRun = !!opts?.dryRun;
  const stats = {
    fuel: 0,
    checkin: 0,
    service: 0,
    manualNormalized: 0,
    skipped: 0,
    errors: 0,
    caches: 0,
  };
  const orgFilter = opts?.organizationId || null;

  {
    let offset = 0;
    for (;;) {
      let q = fleetDb()
        .from(fleetTable("fuel_entries"))
        .select("*")
        .not("odometer", "is", null)
        .gt("odometer", 0)
        .range(offset, offset + 999);
      if (orgFilter) q = q.eq("organization_id", orgFilter);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      if (rows.length === 0) break;
      for (const raw of rows) {
        try {
          const v = rowToKvValue(raw as Record<string, unknown>);
          if (!v.odometer && (raw as any).odometer != null) v.odometer = (raw as any).odometer;
          if (!v.vehicleId && (raw as any).vehicle_id) v.vehicleId = (raw as any).vehicle_id;
          if (!v.id && (raw as any).id) v.id = (raw as any).id;
          if (dryRun) {
            stats.fuel++;
            continue;
          }
          const r = await projectFromFuelEntry(v, (raw as any).organization_id);
          if (r) stats.fuel++;
          else stats.skipped++;
        } catch (e) {
          stats.errors++;
          console.warn("[odometer_ledger backfill] fuel:", e);
        }
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  {
    let offset = 0;
    for (;;) {
      let q = fleetDb().from(fleetTable("checkins")).select("*").range(offset, offset + 999);
      if (orgFilter) q = q.eq("organization_id", orgFilter);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      if (rows.length === 0) break;
      for (const raw of rows) {
        try {
          const v = rowToKvValue(raw as Record<string, unknown>);
          if (!v.odometer && (raw as any).odometer != null) v.odometer = (raw as any).odometer;
          if (!v.vehicleId && (raw as any).vehicle_id) v.vehicleId = (raw as any).vehicle_id;
          if (dryRun) {
            if (Number(v.odometer) > 0) stats.checkin++;
            continue;
          }
          const r = await projectFromCheckIn(v, (raw as any).organization_id);
          if (r) stats.checkin++;
          else stats.skipped++;
        } catch (e) {
          stats.errors++;
          console.warn("[odometer_ledger backfill] checkin:", e);
        }
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  {
    let offset = 0;
    for (;;) {
      let q = fleetDb()
        .from(fleetTable("maintenance_logs"))
        .select("*")
        .range(offset, offset + 999);
      if (orgFilter) q = q.eq("organization_id", orgFilter);
      const { data, error } = await q;
      if (error) {
        console.warn("[odometer_ledger backfill] maintenance_logs:", error.message);
        break;
      }
      const rows = data || [];
      if (rows.length === 0) break;
      for (const raw of rows) {
        try {
          const v = rowToKvValue(raw as Record<string, unknown>);
          if (!v.odometer && (raw as any).odometer != null) v.odometer = (raw as any).odometer;
          if (!v.vehicleId && (raw as any).vehicle_id) v.vehicleId = (raw as any).vehicle_id;
          if (dryRun) {
            if (Number(v.odometer) > 0) stats.service++;
            continue;
          }
          const r = await projectFromMaintenanceLog(v, (raw as any).organization_id);
          if (r) stats.service++;
          else stats.skipped++;
        } catch (e) {
          stats.errors++;
          console.warn("[odometer_ledger backfill] service:", e);
        }
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  // Also project from public/fleet maintenance_records (new garage path)
  {
    let offset = 0;
    for (;;) {
      let q = fleetDb()
        .from("maintenance_records")
        .select("id, vehicle_id, organization_id, performed_at_miles, performed_at_date, service_type, payload_json")
        .gt("performed_at_miles", 0)
        .range(offset, offset + 999);
      if (orgFilter) q = q.eq("organization_id", orgFilter);
      const { data, error } = await q;
      if (error) {
        console.warn("[odometer_ledger backfill] maintenance_records:", error.message);
        break;
      }
      const rows = data || [];
      if (rows.length === 0) break;
      for (const raw of rows) {
        try {
          if (dryRun) {
            stats.service++;
            continue;
          }
          const r = await projectFromMaintenanceLog(
            {
              id: (raw as any).id,
              vehicleId: (raw as any).vehicle_id,
              odometer: (raw as any).performed_at_miles,
              date: (raw as any).performed_at_date,
              serviceType: (raw as any).service_type,
              organizationId: (raw as any).organization_id,
            },
            (raw as any).organization_id,
          );
          if (r) stats.service++;
          else stats.skipped++;
        } catch (e) {
          stats.errors++;
          console.warn("[odometer_ledger backfill] maintenance_records:", e);
        }
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  if (!dryRun) {
    let vq = fleetDb().from(fleetTable("vehicles")).select("id");
    if (orgFilter) vq = vq.eq("organization_id", orgFilter);
    const { data: vehicles } = await vq;
    for (const v of vehicles || []) {
      try {
        await refreshVehicleOdometerCache(String((v as any).id));
        stats.caches++;
      } catch {
        /* skip */
      }
    }
  }

  return stats;
}

export async function odometerLedgerHealth(organizationId?: string | null): Promise<{
  vehiclesChecked: number;
  cacheMismatches: Array<{ vehicleId: string; cache: number; ledger: number }>;
  fuelUnprojected: number;
}> {
  const mismatches: Array<{ vehicleId: string; cache: number; ledger: number }> = [];
  let q = fleetDb().from(fleetTable("vehicles")).select("id, payload_json");
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: vehicles, error } = await q.limit(5000);
  if (error) throw new Error(error.message);

  for (const v of vehicles || []) {
    const id = String((v as any).id);
    const payload = (v as any).payload_json || {};
    const cache = Number(payload?.metrics?.odometer ?? payload?.currentOdometer ?? 0) || 0;
    const current = await getCurrentOdometer(id);
    if (Math.abs(cache - current.km) > 1) {
      mismatches.push({ vehicleId: id, cache, ledger: current.km });
    }
  }

  let fuelQ = fleetDb()
    .from(fleetTable("fuel_entries"))
    .select("id, vehicle_id, odometer")
    .not("odometer", "is", null)
    .gt("odometer", 0)
    .limit(5000);
  if (organizationId) fuelQ = fuelQ.eq("organization_id", organizationId);
  const { data: fuels } = await fuelQ;
  let fuelUnprojected = 0;
  for (const f of fuels || []) {
    const ref = String((f as any).id);
    const vid = String((f as any).vehicle_id || "");
    if (!vid) continue;
    const { data: hit } = await fleetDb()
      .from(TABLE())
      .select("id")
      .eq("vehicle_id", vid)
      .eq("source", "fuel")
      .eq("reference_id", ref)
      .eq("is_voided", false)
      .maybeSingle();
    if (!hit) fuelUnprojected++;
  }

  return {
    vehiclesChecked: (vehicles || []).length,
    cacheMismatches: mismatches.slice(0, 100),
    fuelUnprojected,
  };
}
