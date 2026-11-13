import {
  getColFromRecord,
  normalizeIndriveDriverLookupKey,
  normalizePlate,
  parseCsvDateTimeToJamaicaIso,
  parseCsvRecords,
  toMinor,
} from './common.ts';
import type { AdapterProblem, IndriveCtx, IndriveResult, IndriveTripRow } from './types.ts';

function mapIndrivePaymentMethod(raw: string): 'cash' | 'card' | 'unknown' {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s === 'cash') return 'cash';
  if (s === 'card') return 'card';
  return 'unknown';
}

function resolveDriverId(
  raw: Record<string, string>,
  ctx: IndriveCtx,
): string {
  const driverCol = getColFromRecord(raw, 'driverId', 'driver_id', 'inDriveDriverId', 'in_drive_driver_id');
  const driverName = getColFromRecord(raw, 'driverName', 'driver_name');
  const map = ctx.driverByExternalId;

  if (driverCol) {
    const mapped = map?.[driverCol];
    if (mapped) return mapped;
    const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverCol);
    if (!looksUuid) return driverCol;
  }

  if (driverName && map) {
    const byName = map[normalizeIndriveDriverLookupKey(driverName)];
    if (byName) return byName;
  }

  return '';
}

export function indrive(text: string, ctx: IndriveCtx = {}): IndriveResult {
  const problems: AdapterProblem[] = [];
  const rows: IndriveTripRow[] = [];

  const records = parseCsvRecords(text);
  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const rowNum = i + 2;

    const tripId = getColFromRecord(raw, 'id', 'platform_trip_id', 'platformTripId');
    if (!tripId) {
      problems.push({ row: rowNum, reason: 'Missing trip id' });
      continue;
    }

    const driverId = resolveDriverId(raw, ctx);

    if (!driverId) {
      problems.push({ row: rowNum, reason: 'Missing driver' });
      continue;
    }

    const plateRaw = getColFromRecord(raw, 'vehiclePlate', 'vehicle_plate');
    const plateNorm = plateRaw ? normalizePlate(plateRaw) : '';
    const vehicleId =
      getColFromRecord(raw, 'vehicleId', 'vehicle_id') ||
      (plateNorm ? ctx.vehicleByPlate?.[plateNorm] : undefined) ||
      '';

    if (!vehicleId) {
      problems.push(
        plateNorm
          ? { row: rowNum, reason: `Vehicle not found: ${plateNorm}`, code: 'unknown_plate', value: plateNorm }
          : { row: rowNum, reason: 'Missing vehicle' },
      );
      continue;
    }

    const requestRaw = getColFromRecord(raw, 'requestTime', 'request_at') || getColFromRecord(raw, 'date');
    const dropRaw = getColFromRecord(raw, 'dropoffTime', 'dropoff_at');

    const requestAt = requestRaw ? parseCsvDateTimeToJamaicaIso(requestRaw) : null;
    if (!requestAt) {
      problems.push({ row: rowNum, reason: `Invalid request time: ${requestRaw}` });
      continue;
    }

    const trip: IndriveTripRow = {
      row_type: 'trip',
      platform_trip_id: tripId,
      driver_id: driverId,
      vehicle_id: vehicleId,
      request_at: requestAt,
      payment_method: mapIndrivePaymentMethod(
        getColFromRecord(raw, 'paymentMethod', 'payment_method'),
      ),
    };

    if (dropRaw) {
      const dropoffAt = parseCsvDateTimeToJamaicaIso(dropRaw);
      if (dropoffAt) trip.dropoff_at = dropoffAt;
    }

    const tollMinorCol = getColFromRecord(raw, 'toll_payback_minor');
    const tollDollarCol = getColFromRecord(raw, 'tollCharges', 'toll_charges');
    if (tollMinorCol) {
      const parsed = parseInt(tollMinorCol.replace(/,/g, '').trim(), 10);
      if (!Number.isNaN(parsed) && parsed !== 0) trip.toll_payback_minor = Math.abs(parsed);
    } else if (tollDollarCol) {
      const m = toMinor(tollDollarCol);
      if (m !== null && m !== 0) trip.toll_payback_minor = Math.abs(m);
    }

    rows.push(trip);
  }

  return { kind: 'indrive', rows, problems };
}
