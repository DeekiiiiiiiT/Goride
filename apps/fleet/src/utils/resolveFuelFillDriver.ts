/**
 * Attribute a fuel fill to a driver for shared-car weeks.
 * Order: explicit entry.driverId → gas card → trip proximity → assignment history → currentDriverId → unassigned.
 */

import { UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';
import type { FuelCard, FuelEntry } from '../types/fuel';
import type { Trip } from '../types/data';
import { driverIdAtVehicleTime, type VehicleWithDriverHistory } from './vehicleDriverAssignmentHistory';

export type FillDriverSource =
  | 'explicit'
  | 'gas_card'
  | 'trip'
  | 'assignment_history'
  | 'current_assignment'
  | 'unassigned';

export interface FillDriverResolution {
  driverId: string;
  source: FillDriverSource;
  confidence: 'high' | 'medium' | 'low';
}

function fillAtMs(entry: Pick<FuelEntry, 'date' | 'time'>): number {
  const ymd = String(entry.date || '').split('T')[0];
  const time = entry.time && /^\d{1,2}:\d{2}/.test(entry.time) ? entry.time : '12:00:00';
  const ms = new Date(`${ymd}T${time}`).getTime();
  return Number.isNaN(ms) ? new Date(`${ymd}T12:00:00`).getTime() : ms;
}

function tripNearFill(
  trips: Trip[],
  vehicleId: string | undefined,
  atMs: number,
  ymd: string,
): string | undefined {
  const sameDay = trips.filter((t) => {
    const td = String(t.date || '').split('T')[0];
    if (td !== ymd) return false;
    if (vehicleId && t.vehicleId && t.vehicleId !== vehicleId) return false;
    return !!t.driverId;
  });
  if (sameDay.length === 0) return undefined;

  // Prefer trip whose request/dropoff window covers the fill time
  for (const t of sameDay) {
    const start = t.requestTime ? new Date(t.requestTime).getTime() : NaN;
    const end = t.dropoffTime ? new Date(t.dropoffTime).getTime() : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && atMs >= start && atMs <= end) {
      return t.driverId;
    }
  }
  // Nearest same-day trip by requestTime, else first
  let best: Trip | undefined;
  let bestDelta = Infinity;
  for (const t of sameDay) {
    const start = t.requestTime ? new Date(t.requestTime).getTime() : NaN;
    if (Number.isNaN(start)) continue;
    const delta = Math.abs(start - atMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = t;
    }
  }
  return (best || sameDay[0])?.driverId;
}

export function resolveFuelFillDriver(params: {
  entry: Pick<FuelEntry, 'driverId' | 'vehicleId' | 'cardId' | 'date' | 'time'>;
  vehicles: Array<VehicleWithDriverHistory & { id: string }>;
  fuelCards?: FuelCard[];
  trips?: Trip[];
}): FillDriverResolution {
  const { entry, vehicles, fuelCards = [], trips = [] } = params;
  const atMs = fillAtMs(entry);
  const ymd = String(entry.date || '').split('T')[0];

  if (entry.driverId) {
    return { driverId: entry.driverId, source: 'explicit', confidence: 'high' };
  }

  if (entry.cardId) {
    const card = fuelCards.find((c) => c.id === entry.cardId);
    if (card?.assignedDriverId) {
      return { driverId: card.assignedDriverId, source: 'gas_card', confidence: 'high' };
    }
  }

  const vehicle = entry.vehicleId
    ? vehicles.find((v) => v.id === entry.vehicleId)
    : undefined;

  const fromTrip = tripNearFill(trips, entry.vehicleId, atMs, ymd);
  if (fromTrip) {
    return { driverId: fromTrip, source: 'trip', confidence: 'medium' };
  }

  if (vehicle?.driverAssignmentHistory?.length) {
    const fromHistory = driverIdAtVehicleTime(vehicle, atMs);
    if (fromHistory) {
      return { driverId: fromHistory, source: 'assignment_history', confidence: 'medium' };
    }
  }

  if (vehicle?.currentDriverId) {
    return {
      driverId: vehicle.currentDriverId,
      source: 'current_assignment',
      confidence: 'low',
    };
  }

  return {
    driverId: UNASSIGNED_FUEL_DRIVER_ID,
    source: 'unassigned',
    confidence: 'low',
  };
}

/** Stamp resolved driverId onto entries missing one (non-mutating copy). */
export function stampAttributedDriverIds(
  entries: FuelEntry[],
  vehicles: Array<VehicleWithDriverHistory & { id: string }>,
  fuelCards: FuelCard[] = [],
  trips: Trip[] = [],
): FuelEntry[] {
  return entries.map((e) => {
    if (e.driverId) return e;
    const { driverId } = resolveFuelFillDriver({ entry: e, vehicles, fuelCards, trips });
    if (driverId === UNASSIGNED_FUEL_DRIVER_ID) return e;
    return { ...e, driverId };
  });
}
