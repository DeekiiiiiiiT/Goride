import type { DriverOfferWithRide } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

export function formatHaulPayout(offer: DriverOfferWithRide): string {
  const ride = offer.ride;
  if (!ride) return '—';
  return formatMoneyMinor(ride.fare_estimate_minor, ride.currency ?? 'JMD');
}

export function formatHaulDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return km.toFixed(1);
}

export function offerTotalSeconds(offer: DriverOfferWithRide): number {
  const created = new Date(offer.created_at).getTime();
  const expires = new Date(offer.expires_at).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) return 60;
  return Math.max(1, Math.ceil((expires - created) / 1000));
}

export function offerSecondsRemaining(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export function customerDisplayName(offer: DriverOfferWithRide): string {
  const name = offer.ride?.guest_passenger_name?.trim();
  return name || 'Customer';
}

export function manifestItemCount(offer: DriverOfferWithRide): number {
  const lines = offer.ride?.haulage_manifest?.lines;
  if (!lines?.length) return 0;
  return lines.reduce((sum, line) => sum + (line.qty || 1), 0);
}
