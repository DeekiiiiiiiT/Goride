import type { RideRequestRow } from '@roam/types/rides';

export function activityTripWhen(trip: { ended_at?: string; created_at?: string }): Date {
  return new Date(trip.ended_at ?? trip.created_at ?? Date.now());
}

export function ridePickupTime(ride: RideRequestRow): Date | null {
  const iso = ride.arrived_pickup_at ?? ride.trip_started_at ?? ride.en_route_at ?? ride.created_at;
  return iso ? new Date(iso) : null;
}

export function rideDropoffTime(ride: RideRequestRow): Date | null {
  if (ride.completed_at) return new Date(ride.completed_at);
  if (ride.dropoff_arrived_at) return new Date(ride.dropoff_arrived_at);
  if (ride.status === 'cancelled' && ride.updated_at) return new Date(ride.updated_at);
  return null;
}

export function formatActivityTimeLabel(when: Date | null): string {
  if (!when || Number.isNaN(when.getTime())) return '';
  return when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatActivityDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} • ${time}`;
}

export function formatActivityTime24(when: Date | null): string {
  if (!when || Number.isNaN(when.getTime())) return '';
  const h = when.getHours().toString().padStart(2, '0');
  const m = when.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function formatActivityDateTime(when: Date): string {
  return when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function readTipMinor(ride: RideRequestRow): number {
  const raw = (ride as Record<string, unknown>).tip_minor;
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}
