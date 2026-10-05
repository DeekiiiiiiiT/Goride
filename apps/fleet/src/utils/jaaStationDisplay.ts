import type { FuelEntry } from '../types/fuel';
import type { StationProfile } from '../types/station';

function normalizeVendorName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[len1][len2];
}

function calculateSimilarity(str1: string, str2: string): number {
  const a = normalizeVendorName(str1);
  const b = normalizeVendorName(str2);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.7 + 0.3 * (shorter / longer);
  }
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - levenshteinDistance(a, b) / maxLen);
}

/** Best verified station for a JAA/vendor string (name, brand, aliases). */
export function matchVendorToVerifiedStation(
  vendorName: string,
  stations: StationProfile[],
  minConfidence = 0.65,
): StationProfile | null {
  const raw = String(vendorName || '').trim();
  if (!raw || !stations.length) return null;

  let best: { station: StationProfile; score: number } | null = null;
  for (const station of stations) {
    if (station.status && station.status !== 'verified') continue;
    let score = Math.max(
      calculateSimilarity(raw, station.name || ''),
      calculateSimilarity(raw, station.brand || ''),
    );
    for (const alias of station.aliases || []) {
      score = Math.max(score, calculateSimilarity(raw, alias.label || ''));
    }
    if (score < minConfidence) continue;
    if (!best || score > best.score) best = { station, score };
  }
  return best?.station ?? null;
}

export type StationDisplayResult = {
  label: string;
  /** true when label came from verified list or linked driver station */
  fromVerified: boolean;
  jaaRaw: string;
};

/**
 * Card Inventory Station column: verified Roam name when we can resolve it; else JAA text.
 * Prefer linked driver log station (matchedStationId / location) over fuzzy vendor match.
 */
export function resolveCardTransactionStation(
  entry: FuelEntry,
  verifiedStations: StationProfile[],
  entryById?: Map<string, FuelEntry>,
): StationDisplayResult {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const jaaRaw = String(m.jaaStation || entry.location || '').trim();

  const linkedId = String(m.jaaMatchedDriverEntryId || '');
  const linked = linkedId && entryById ? entryById.get(linkedId) : undefined;
  if (linked) {
    const lm = (linked.metadata || {}) as Record<string, unknown>;
    const stationId = String(
      linked.matchedStationId || lm.matchedStationId || lm.bridgedStationId || '',
    );
    if (stationId) {
      const byId = verifiedStations.find((s) => s.id === stationId);
      if (byId?.name) {
        return { label: byId.name, fromVerified: true, jaaRaw };
      }
    }
    const driverLoc = String(linked.location || '').trim();
    if (driverLoc && driverLoc.toLowerCase() !== 'manual entry') {
      const matched = matchVendorToVerifiedStation(driverLoc, verifiedStations);
      if (matched) return { label: matched.name, fromVerified: true, jaaRaw };
      return { label: driverLoc, fromVerified: true, jaaRaw };
    }
  }

  if (jaaRaw && jaaRaw !== '—') {
    const matched = matchVendorToVerifiedStation(jaaRaw, verifiedStations);
    if (matched) return { label: matched.name, fromVerified: true, jaaRaw };
  }

  return { label: jaaRaw || '—', fromVerified: false, jaaRaw };
}

export type FuelEntryStationDisplay = {
  /** Parent company, or station name when brand is Independent / empty. */
  title: string;
  /** Street address from verified ledger (or entry fallbacks). */
  subtitle: string;
};

function isIndependentBrand(brand?: string | null): boolean {
  const b = String(brand || '').trim();
  return !b || b.toLowerCase() === 'independent';
}

function resolveStationForFuelEntry(
  entry: FuelEntry,
  stations: StationProfile[],
): StationProfile | null {
  if (!stations.length) return null;
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const stationId = String(
    entry.matchedStationId || meta.matchedStationId || meta.bridgedStationId || '',
  ).trim();
  if (stationId) {
    const byId = stations.find((s) => s.id === stationId);
    if (byId) return byId;
  }
  const candidates = [
    entry.vendor,
    meta.stationName,
    entry.location,
    meta.jaaStation,
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && v.toLowerCase() !== 'manual entry');
  for (const raw of candidates) {
    const hit = matchVendorToVerifiedStation(raw, stations);
    if (hit) return hit;
  }
  return null;
}

/**
 * Transaction Logs Station column: brand (or independent station name) + street address.
 * Joins verified Dominion ledger via matchedStationId, else fuzzy vendor match.
 */
export function resolveFuelEntryStationDisplay(
  entry: FuelEntry,
  stations: StationProfile[],
): FuelEntryStationDisplay {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const station = resolveStationForFuelEntry(entry, stations);

  if (station) {
    const title = isIndependentBrand(station.brand)
      ? String(
          station.name ||
            entry.vendor ||
            meta.stationName ||
            entry.location ||
            'Unknown Station',
        ).trim()
      : String(station.brand).trim();
    const subtitle =
      String(station.address || '').trim() ||
      String(entry.stationAddress || '').trim() ||
      String(meta.stationLocation || '').trim() ||
      'No GPS metadata';
    return { title: title || 'Unknown Station', subtitle };
  }

  const title =
    String(entry.vendor || '').trim() ||
    String(meta.stationName || '').trim() ||
    String(entry.location || '').trim() ||
    'Unknown Station';
  const addressOnly =
    String(entry.stationAddress || '').trim() ||
    String(meta.stationLocation || '').trim();
  const loc = meta.locationMetadata as { lat?: unknown; lng?: unknown } | undefined;
  const raw = entry as FuelEntry & { lat?: unknown; lng?: unknown };
  const lat = Number(loc?.lat ?? raw.lat ?? meta.lat);
  const lng = Number(loc?.lng ?? raw.lng ?? meta.lng);
  const gpsCaptured = Number.isFinite(lat) && lat !== 0 && Number.isFinite(lng) && lng !== 0;
  // Never repeat the station name on the subtitle line
  const subtitle =
    addressOnly && normalizeVendorName(addressOnly) !== normalizeVendorName(title)
      ? addressOnly
      : gpsCaptured
        ? 'GPS captured — not matched'
        : 'No GPS metadata';

  return { title, subtitle };
}
