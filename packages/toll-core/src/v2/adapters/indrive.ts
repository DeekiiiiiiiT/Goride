import {
  getColFromRecord,
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

    const driverName = getColFromRecord(raw, 'driverName', 'driver_name');
    const driverCol = getColFromRecord(raw, 'driverId', 'driver_id');
    const driverId =
      driverCol || (driverName ? ctx.driverByExternalId?.[driverName] : undefined) || '';

    if (!driverId) {
      problems.push({ row: rowNum, reason: 'Missing driver' });
      continue;
    }

    const vehicleId =
      getColFromRecord(raw, 'vehicleId', 'vehicle_id') ||
      ctx.vehicleByPlate?.[getColFromRecord(raw, 'vehiclePlate', 'vehicle_plate')] ||
      '';

    if (!vehicleId) {
      problems.push({ row: rowNum, reason: 'Missing vehicle' });
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

    const tollStr = getColFromRecord(raw, 'tollCharges', 'toll_charges', 'toll_payback_minor');
    if (tollStr) {
      const m = toMinor(tollStr);
      if (m !== null && m !== 0) trip.toll_payback_minor = Math.abs(m);
    }

    rows.push(trip);
  }

  return { kind: 'indrive', rows, problems };
}
