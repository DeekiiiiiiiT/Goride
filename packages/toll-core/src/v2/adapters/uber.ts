import {
  detectIsMMDDFromRows,
  getColFromRecord,
  parseCsvRecords,
  parseUberDateString,
  toMinor,
  wallClockToJamaicaDate,
  wallClockToJamaicaIso,
  normalizePlate,
} from './common.ts';
import type {
  AdapterProblem,
  UberAdjustmentRow,
  UberCtx,
  UberResult,
  UberRow,
  UberTripRow,
} from './types.ts';

export interface UberFiles {
  payments: string;
  tripActivity: string;
}

const TOLL_COL_ALIASES = [
  'Paid to you:Trip balance:Refunds:Toll',
  'Paid to you : Trip balance : Refunds : Toll',
  'Paid to you: Trip balance: Refunds: Toll',
];

const CASH_COL_ALIASES = [
  'Paid to you:Trip balance:Payouts:Cash Collected',
  'Paid to you : Trip balance : Payouts : Cash Collected',
  'Cash Collected',
  'Cash collected',
];

function firstAmountMinor(row: Record<string, string>, aliases: string[]): number {
  for (const col of aliases) {
    const v = getColFromRecord(row, col);
    if (v) {
      const m = toMinor(v);
      if (m !== null) return m;
    }
  }
  return 0;
}

function parseVsReportingDate(raw: string): string | null {
  const trimmed = (raw || '').trim();
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const clock = parseUberDateString(trimmed, false);
  if (clock) return wallClockToJamaicaDate(clock);
  return null;
}

function extractSupportCaseUuid(desc: string): string | null {
  const m = desc.match(/^Support Adjustment:\s*(.+)$/i);
  if (!m) return null;
  const id = m[1].trim();
  return id || null;
}

export function uber(files: UberFiles, ctx: UberCtx): UberResult {
  const problems: AdapterProblem[] = [];
  const rows: UberRow[] = [];

  const paymentRows = parseCsvRecords(files.payments);
  const activityRows = parseCsvRecords(files.tripActivity);

  const isMMDD = detectIsMMDDFromRows(activityRows, [
    'Trip request time',
    'Trip drop off time',
    'Trip request time',
  ]);

  type TripAct = {
    plate: string;
    requestAt?: string;
    dropoffAt?: string;
    driverUuid: string;
  };
  const tripActivity = new Map<string, TripAct>();

  for (let i = 0; i < activityRows.length; i++) {
    const row = activityRows[i];
    const tripId = getColFromRecord(row, 'Trip UUID', 'trip uuid');
    if (!tripId) continue;

    const plate = getColFromRecord(row, 'License plate', 'license plate');
    let reqVal =
      getColFromRecord(row, 'Trip request time', 'Request Time', 'Request time') ||
      undefined;
    let dropVal =
      getColFromRecord(row, 'Trip drop off time', 'Drop off time', 'Drop-off time', 'Dropoff Time') ||
      undefined;

    const act: TripAct = {
      plate,
      driverUuid: getColFromRecord(row, 'Driver UUID', 'driver uuid'),
    };

    if (reqVal) {
      const clock = parseUberDateString(reqVal, isMMDD);
      if (clock) act.requestAt = wallClockToJamaicaIso(clock);
      else problems.push({ row: i + 2, reason: `Invalid request time: ${reqVal}` });
    }
    if (dropVal) {
      const clock = parseUberDateString(dropVal, isMMDD);
      if (clock) act.dropoffAt = wallClockToJamaicaIso(clock);
    }
    tripActivity.set(tripId.trim(), act);
  }

  const tollByTrip = new Map<string, number>();
  const cashByTrip = new Map<string, number>();
  const driverByTrip = new Map<string, string>();

  for (let i = 0; i < paymentRows.length; i++) {
    const row = paymentRows[i];
    const rowNum = i + 2;
    const desc = getColFromRecord(row, 'Description', 'description');
    const tripId = getColFromRecord(row, 'Trip UUID', 'trip uuid');

    const tollMinor = firstAmountMinor(row, TOLL_COL_ALIASES);

    if (desc.toLowerCase().startsWith('support adjustment')) {
      if (tollMinor !== 0) {
        const ref = extractSupportCaseUuid(desc);
        if (!ref) {
          problems.push({ row: rowNum, reason: 'Support adjustment missing case UUID' });
          continue;
        }
        const paidOn = parseVsReportingDate(getColFromRecord(row, 'vs reporting', 'vs reporting '));
        if (!paidOn) {
          problems.push({ row: rowNum, reason: 'Adjustment date unreadable' });
          continue;
        }
        const driverUuid = getColFromRecord(row, 'Driver UUID', 'driver uuid');
        const driverId = ctx.driverByUberUuid[driverUuid];
        if (!driverId) {
          problems.push({ row: rowNum, reason: `Driver not found: ${driverUuid}` });
          continue;
        }
        const adj: UberAdjustmentRow = {
          row_type: 'adjustment',
          reference: ref,
          driver_id: driverId,
          paid_on: paidOn,
          amount_minor: tollMinor,
        };
        rows.push(adj);
      }
      continue;
    }

    if (!tripId) continue;

    const tid = tripId.trim();
    tollByTrip.set(tid, (tollByTrip.get(tid) ?? 0) + tollMinor);

    const cashMinor = firstAmountMinor(row, CASH_COL_ALIASES);
    cashByTrip.set(tid, (cashByTrip.get(tid) ?? 0) + cashMinor);

    const driverUuid = getColFromRecord(row, 'Driver UUID', 'driver uuid');
    if (driverUuid) driverByTrip.set(tid, driverUuid);
  }

  const tripIdSet = new Set<string>([...tripActivity.keys(), ...tollByTrip.keys()]);
  const tripIds = [...tripIdSet].sort();
  for (const tripId of tripIds) {
    const tollMinor = tollByTrip.get(tripId) ?? 0;
    const activity = tripActivity.get(tripId);
    if (!activity?.requestAt) {
      if (tollMinor !== 0 || (cashByTrip.get(tripId) ?? 0) !== 0) {
        problems.push({ row: 0, reason: `Trip ${tripId} missing trip_activity times` });
      }
      continue;
    }

    const cashSum = cashByTrip.get(tripId) ?? 0;
    const driverUuid = driverByTrip.get(tripId) ?? activity.driverUuid;
    const driverId = ctx.driverByUberUuid[driverUuid];
    if (!driverId) {
      problems.push({ row: 0, reason: `Driver not found: ${driverUuid}` });
      continue;
    }
    const plate = normalizePlate(activity.plate);
    const vehicleId = ctx.vehicleByPlate[plate];
    if (!vehicleId) {
      problems.push({ row: 0, reason: `Vehicle not found: ${plate}` });
      continue;
    }

    const trip: UberTripRow = {
      row_type: 'trip',
      platform_trip_id: tripId,
      driver_id: driverId,
      vehicle_id: vehicleId,
      request_at: activity.requestAt,
      time_precision: 'minute',
      payment_method: cashSum !== 0 ? 'cash' : 'card',
    };
    if (activity.dropoffAt) trip.dropoff_at = activity.dropoffAt;
    if (tollMinor !== 0) trip.toll_payback_minor = tollMinor;
    rows.push(trip);
  }

  rows.sort((a, b) => {
    const ka = a.row_type === 'trip' ? `t:${a.platform_trip_id}` : `a:${a.reference}`;
    const kb = b.row_type === 'trip' ? `t:${b.platform_trip_id}` : `a:${b.reference}`;
    return ka.localeCompare(kb);
  });

  return { kind: 'uber', rows, problems };
}
