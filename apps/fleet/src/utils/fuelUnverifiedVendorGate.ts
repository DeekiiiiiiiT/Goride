/**
 * Vendor Gate — when to auto-create an unverified vendor after a fuel log save.
 * GPS coords live on locationMetadata (not geofenceMetadata). R6-1.
 */
import type { FuelEntry } from '../types/fuel';

/** True when the fill has usable GPS coordinates. */
export function hasFuelEntryGpsCoords(entry: Pick<FuelEntry, 'locationMetadata'>): boolean {
  const lat = entry.locationMetadata?.lat;
  const lng = entry.locationMetadata?.lng;
  return lat != null && Number.isFinite(lat) && lng != null && Number.isFinite(lng);
}

/**
 * Whether Phase 7 should call createUnverifiedVendor for this saved log.
 * @param opts.skip — e.g. editingLog path; never create while editing.
 */
export function shouldCreateUnverifiedVendor(
  entry: Pick<FuelEntry, 'transactionId' | 'matchedStationId' | 'location' | 'locationMetadata'>,
  opts?: { skip?: boolean },
): boolean {
  if (opts?.skip) return false;
  if (!entry.transactionId) return false;
  if (entry.matchedStationId) return false;
  if (hasFuelEntryGpsCoords(entry)) return false;
  const vendorName = entry.location?.trim();
  return Boolean(vendorName);
}
