import type { FuelEntry } from '../types/fuel';
import type { StationProfile } from '../types/station';
import { calculateDistance } from './geoUtils';

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

const MERCHANT_STOPWORDS = new Set([
  'service',
  'centre',
  'center',
  'station',
  'ltd',
  'limited',
  'gas',
  'fuel',
  'the',
  'and',
  'petroleum',
  'company',
]);

function significantTokens(name: string): string[] {
  return normalizeVendorName(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !MERCHANT_STOPWORDS.has(token));
}

/** "SUPER LUBE SERVICE CENTRE" and "Super Lube Fairview" share the real name. */
function tokenSubsetScore(a: string, b: string): number {
  const left = significantTokens(a);
  const right = significantTokens(b);
  if (!left.length || !right.length) return 0;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const covered = shorter.every((token) => longer.includes(token));
  if (!covered) return 0;
  if (shorter.length >= 2 || shorter[0].length >= 5) return 0.9;
  return 0;
}

function scoreVendorAgainstStation(vendorName: string, station: StationProfile): number {
  let score = Math.max(
    calculateSimilarity(vendorName, station.name || ''),
    calculateSimilarity(vendorName, station.brand || ''),
    tokenSubsetScore(vendorName, station.name || ''),
    tokenSubsetScore(vendorName, station.brand || ''),
  );
  for (const alias of station.aliases || []) {
    const label = alias.label || '';
    score = Math.max(
      score,
      calculateSimilarity(vendorName, label),
      tokenSubsetScore(vendorName, label),
    );
  }
  return score;
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
    const score = scoreVendorAgainstStation(raw, station);
    if (score < minConfidence) continue;
    if (!best || score > best.score) best = { station, score };
  }
  return best?.station ?? null;
}

/**
 * Same as matchVendorToVerifiedStation, but refuses a close tie so two
 * Super Lube branches are not silently swapped.
 */
export function matchUniqueVendorToVerifiedStation(
  vendorName: string,
  stations: StationProfile[],
  minConfidence = 0.65,
): StationProfile | null {
  const raw = String(vendorName || '').trim();
  if (!raw || !stations.length) return null;
  const scored: { station: StationProfile; score: number }[] = [];
  for (const station of stations) {
    if (station.status && station.status !== 'verified') continue;
    const score = scoreVendorAgainstStation(raw, station);
    if (score < minConfidence) continue;
    scored.push({ station, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return null;
  const runner = scored[1];
  if (runner && top.score - runner.score < 0.08) return null;
  return top.station;
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
    const matched = matchUniqueVendorToVerifiedStation(jaaRaw, verifiedStations);
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

function stationById(stations: StationProfile[], id: string): StationProfile | null {
  const hit = stations.find((s) => s.id === id);
  if (!hit) return null;
  if (hit.status && hit.status !== 'verified') return null;
  return hit;
}

const GPS_SIBLING_WINDOW_MS = 10 * 60 * 1000;

function entryMeta(entry: FuelEntry): Record<string, unknown> {
  return (entry.metadata || {}) as Record<string, unknown>;
}

/** Driver GPS lives on locationMetadata. Card-file rows usually have none. */
function gpsFix(entry: FuelEntry): { lat: number; lng: number } | null {
  const meta = entryMeta(entry);
  const loc = (entry.locationMetadata || meta.locationMetadata) as
    | { lat?: unknown; lng?: unknown }
    | undefined;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  return { lat, lng };
}

/** Local wall-clock on the log. Both sides parsed the same way so UTC stamps are not mixed in. */
function localInstant(entry: FuelEntry): number | null {
  const date = String(entry.date || '').slice(0, 10);
  const time = String(entry.time || '').slice(0, 8);
  if (!date || !time) return null;
  const ms = Date.parse(`${date}T${time}`);
  return Number.isFinite(ms) ? ms : null;
}

function fenceRadius(station: StationProfile): number {
  const raw = Number(station.geofenceRadius || station.location?.radius || 75);
  return Number.isFinite(raw) && raw > 0 ? raw : 75;
}

/** Verified station whose fence contains this point. Closest pin wins if two overlap. */
function stationContainingGps(
  lat: number,
  lng: number,
  stations: StationProfile[],
): StationProfile | null {
  let best: { station: StationProfile; distance: number } | null = null;
  for (const station of stations) {
    if (station.status && station.status !== 'verified') continue;
    const slat = Number(station.location?.lat);
    const slng = Number(station.location?.lng);
    if (!Number.isFinite(slat) || !Number.isFinite(slng) || (slat === 0 && slng === 0)) continue;
    const distance = calculateDistance(lat, lng, slat, slng);
    if (distance > fenceRadius(station)) continue;
    if (!best || distance < best.distance) best = { station, distance };
  }
  return best?.station ?? null;
}

/**
 * Card statement rows do not carry GPS. The driver fill on the same vehicle,
 * a few minutes either side, does. Use that pin only when it sits inside a fence.
 */
function stationFromSiblingGps(
  entry: FuelEntry,
  stations: StationProfile[],
  logs: FuelEntry[],
): StationProfile | null {
  const at = localInstant(entry);
  const vehicleId = String(entry.vehicleId || '').trim();
  if (at == null || !vehicleId) return null;
  let best: { station: StationProfile; gap: number } | null = null;
  for (const sibling of logs) {
    if (!sibling || sibling.id === entry.id) continue;
    if (String(sibling.vehicleId || '').trim() !== vehicleId) continue;
    const siblingAt = localInstant(sibling);
    const fix = gpsFix(sibling);
    if (siblingAt == null || !fix) continue;
    const gap = Math.abs(siblingAt - at);
    if (gap > GPS_SIBLING_WINDOW_MS) continue;
    const station = stationContainingGps(fix.lat, fix.lng, stations);
    if (!station) continue;
    if (!best || gap < best.gap) best = { station, gap };
  }
  return best?.station ?? null;
}

export function resolveVerifiedStationForFuelEntry(
  entry: FuelEntry,
  stations: StationProfile[],
  logs: FuelEntry[] = [],
): StationProfile | null {
  if (!stations.length) return null;
  const meta = entryMeta(entry);
  const stationId = String(
    entry.matchedStationId || meta.matchedStationId || meta.bridgedStationId || '',
  ).trim();
  if (stationId) {
    const byId = stationById(stations, stationId);
    if (byId) return byId;
  }
  const own = gpsFix(entry);
  if (own) {
    const hit = stationContainingGps(own.lat, own.lng, stations);
    if (hit) return hit;
  }
  const fromSibling = stationFromSiblingGps(entry, stations, logs);
  if (fromSibling) return fromSibling;
  const candidates = [
    entry.vendor,
    meta.stationName,
    entry.location,
    meta.jaaStation,
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && v.toLowerCase() !== 'manual entry');
  for (const raw of candidates) {
    const hit = matchUniqueVendorToVerifiedStation(raw, stations);
    if (hit) return hit;
  }
  return null;
}

/**
 * Transaction Logs Station column: brand (or independent station name) + street address.
 * Joins verified Dominion ledger via matched station, the driver's GPS fence, else a unique name match.
 */
export function resolveFuelEntryStationDisplay(
  entry: FuelEntry,
  stations: StationProfile[],
  logs: FuelEntry[] = [],
): FuelEntryStationDisplay {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const station = resolveVerifiedStationForFuelEntry(entry, stations, logs);

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
