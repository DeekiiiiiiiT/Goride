import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

export function haulCustomerName(ride: RideRequestRow): string {
  return ride.guest_passenger_name?.trim() || 'Customer';
}

export function haulJobRef(ride: RideRequestRow): string {
  const id = ride.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `#RH-${id}`;
}

export function splitAddress(address: string | null | undefined): { line1: string; line2: string } {
  const trimmed = address?.trim();
  if (!trimmed) return { line1: 'Address pending', line2: '' };
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length <= 1) return { line1: trimmed, line2: '' };
  return { line1: parts[0], line2: parts.slice(1).join(', ') };
}

export function formatRideKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return `${km.toFixed(1)} km`;
}

export function formatRideMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return '—';
  return `${Math.max(1, Math.round(mins))} min`;
}

export type EarningsLine = { label: string; value: string; badge?: string };

export function buildHaulEarningsLines(ride: RideRequestRow): {
  lines: EarningsLine[];
  total: string;
} {
  const currency = ride.currency ?? 'JMD';
  const breakdown = ride.fare_final_breakdown ?? ride.fare_breakdown;
  const totalMinor = ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0;
  const lines: EarningsLine[] = [];

  if (breakdown) {
    if (breakdown.base_minor > 0) {
      lines.push({ label: 'Base fare', value: formatMoneyMinor(breakdown.base_minor, currency) });
    }
    if (breakdown.distance_component_minor > 0) {
      lines.push({
        label: 'Distance',
        value: formatMoneyMinor(breakdown.distance_component_minor, currency),
      });
    }
    if (breakdown.time_component_minor > 0) {
      lines.push({
        label: 'Time',
        value: formatMoneyMinor(breakdown.time_component_minor, currency),
      });
    }
    if (breakdown.wait_time_fee_minor && breakdown.wait_time_fee_minor > 0) {
      lines.push({
        label: 'Wait time',
        value: formatMoneyMinor(breakdown.wait_time_fee_minor, currency),
      });
    }
    const surgeExtra =
      breakdown.after_surge_minor > breakdown.subtotal_before_surge_minor
        ? breakdown.after_surge_minor - breakdown.subtotal_before_surge_minor
        : 0;
    if (surgeExtra > 0) {
      lines.push({
        label: 'Surge',
        value: formatMoneyMinor(surgeExtra, currency),
        badge: breakdown.surge_multiplier > 1 ? `x${breakdown.surge_multiplier.toFixed(1)}` : undefined,
      });
    }
  }

  if (lines.length === 0) {
    lines.push({ label: 'Trip fare', value: formatMoneyMinor(totalMinor, currency) });
  }

  return { lines, total: formatMoneyMinor(totalMinor, currency) };
}
