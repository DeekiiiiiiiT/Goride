import type { LocationValue } from './types';

export function isLocationComplete(value: Partial<LocationValue> | null | undefined): boolean {
  if (!value) return false;
  return (
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lng) &&
    value.streetAddress.trim().length >= 3 &&
    value.city.trim().length >= 2
  );
}

export function formatLocationAddress(value: Partial<LocationValue>): string {
  const parts = [value.streetAddress, value.city, value.postalCode].filter(
    (p) => typeof p === 'string' && p.trim(),
  );
  return parts.join(', ');
}
