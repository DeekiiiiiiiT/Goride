import { differenceInSeconds, format } from 'date-fns';
import type { FareBreakdown, RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import type { RoutePoint } from '../../types/tripSession';

export function tripWhen(trip: RideRequestRow): Date {
  return new Date(trip.completed_at ?? trip.created_at);
}

export function resolveFareBreakdown(trip: RideRequestRow): FareBreakdown | null {
  const raw = trip.fare_final_breakdown ?? trip.fare_breakdown;
  return raw && typeof raw === 'object' ? raw : null;
}

export function tripPickupTime(trip: RideRequestRow): Date | null {
  const iso = trip.arrived_pickup_at ?? trip.trip_started_at ?? trip.en_route_at;
  return iso ? new Date(iso) : null;
}

export function tripDropoffTime(trip: RideRequestRow): Date | null {
  if (trip.completed_at) return new Date(trip.completed_at);
  if (trip.dropoff_arrived_at) return new Date(trip.dropoff_arrived_at);
  return null;
}

export function formatTripTimeLabel(when: Date | null): string {
  if (!when) return '';
  return format(when, 'h:mm a');
}

export function formatTripDuration(trip: RideRequestRow): string {
  if (trip.trip_started_at && trip.completed_at) {
    const sec = differenceInSeconds(new Date(trip.completed_at), new Date(trip.trip_started_at));
    if (sec > 0) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}m ${s}s`;
    }
  }
  const est = trip.duration_estimate_minutes;
  if (est != null && !Number.isNaN(est)) {
    const n = Math.round(est);
    return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} min`;
  }
  return '—';
}

export function formatDistanceLabel(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '';
  return `${Number(km).toFixed(1)} km`;
}

export function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const n = Math.round(minutes);
  return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} min`;
}

export function tripRoutePoints(trip: RideRequestRow): RoutePoint[] {
  return [
    { lat: trip.pickup_lat, lon: trip.pickup_lng, timestamp: 0 },
    { lat: trip.dropoff_lat, lon: trip.dropoff_lng, timestamp: 1 },
  ];
}

export function tripDisplayId(trip: RideRequestRow): string {
  const short = trip.id.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `#RM-${short}`;
}

export type FareLine = { label: string; amount: string; highlight?: boolean };

export function buildFareLines(trip: RideRequestRow): FareLine[] {
  const breakdown = resolveFareBreakdown(trip);
  const currency = trip.currency;
  const lines: FareLine[] = [];

  if (breakdown) {
    if (breakdown.base_minor > 0) {
      lines.push({
        label: 'Base Fare',
        amount: formatMoneyMinor(breakdown.base_minor, currency),
      });
    }
    if (breakdown.distance_component_minor > 0) {
      const dist =
        breakdown.distance_km ?? trip.distance_estimate_km ?? null;
      const distLabel = dist != null ? ` (${formatDistanceLabel(dist)})` : '';
      lines.push({
        label: `Distance${distLabel}`,
        amount: formatMoneyMinor(breakdown.distance_component_minor, currency),
      });
    }
    if (breakdown.time_component_minor > 0) {
      const dur =
        breakdown.duration_minutes ?? trip.duration_estimate_minutes ?? null;
      const durLabel = dur != null ? ` (${formatDurationLabel(dur)})` : '';
      lines.push({
        label: `Time${durLabel}`,
        amount: formatMoneyMinor(breakdown.time_component_minor, currency),
      });
    }
    if (breakdown.booking_fee_minor > 0) {
      lines.push({
        label: 'Booking Fee',
        amount: formatMoneyMinor(breakdown.booking_fee_minor, currency),
      });
    }
    const tolls = trip.actual_tolls_minor ?? breakdown.estimated_tolls_minor ?? 0;
    if (tolls > 0) {
      lines.push({
        label: 'Tolls',
        amount: formatMoneyMinor(tolls, currency),
      });
    }
    if (breakdown.surge_multiplier > 1 && breakdown.after_surge_minor > breakdown.subtotal_before_surge_minor) {
      const surgeDelta = breakdown.after_surge_minor - breakdown.subtotal_before_surge_minor;
      lines.push({
        label: `Surge (${breakdown.surge_multiplier}×)`,
        amount: formatMoneyMinor(surgeDelta, currency),
      });
    }
  }

  return lines;
}

export function tripTotalEarnings(trip: RideRequestRow): string {
  const minor = trip.fare_final_minor ?? trip.fare_estimate_minor;
  return formatMoneyMinor(minor, trip.currency);
}
