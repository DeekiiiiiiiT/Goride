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

function matchVendorToVerifiedStation(
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

export type FuelEntryStationDisplay = {
  title: string;
  subtitle: string;
};

function isIndependentBrand(brand?: string | null): boolean {
  const b = String(brand || '').trim();
  return !b || b.toLowerCase() === 'independent';
}

function resolveStationForFuelEntry(
  entry: FuelEntry | Record<string, unknown>,
  stations: StationProfile[],
): StationProfile | null {
  if (!stations.length) return null;
  const e = entry as FuelEntry;
  const meta = (e.metadata || {}) as Record<string, unknown>;
  const stationId = String(
    e.matchedStationId || meta.matchedStationId || meta.bridgedStationId || '',
  ).trim();
  if (stationId) {
    const byId = stations.find((s) => s.id === stationId);
    if (byId) return byId;
  }
  const candidates = [
    e.vendor,
    meta.stationName,
    (entry as { station?: string }).station,
    (entry as { stationName?: string }).stationName,
    e.location,
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

/** Parent company (or independent station name) + street address for driver expense list. */
export function resolveFuelEntryStationDisplay(
  entry: FuelEntry | Record<string, unknown>,
  stations: StationProfile[],
): FuelEntryStationDisplay {
  const e = entry as FuelEntry;
  const meta = (e.metadata || {}) as Record<string, unknown>;
  const station = resolveStationForFuelEntry(entry, stations);

  if (station) {
    const title = isIndependentBrand(station.brand)
      ? String(
          station.name ||
            e.vendor ||
            meta.stationName ||
            (entry as { station?: string }).station ||
            e.location ||
            'Unknown Station',
        ).trim()
      : String(station.brand).trim();
    const subtitle =
      String(station.address || '').trim() ||
      String(e.stationAddress || '').trim() ||
      String(meta.stationLocation || '').trim() ||
      'No GPS metadata';
    return { title: title || 'Unknown Station', subtitle };
  }

  const title =
    String(e.vendor || '').trim() ||
    String(meta.stationName || '').trim() ||
    String((entry as { station?: string }).station || '').trim() ||
    String((entry as { stationName?: string }).stationName || '').trim() ||
    String(e.location || '').trim() ||
    'Unknown Station';
  const addressOnly =
    String(e.stationAddress || '').trim() ||
    String(meta.stationLocation || '').trim();
  const subtitle =
    addressOnly && normalizeVendorName(addressOnly) !== normalizeVendorName(title)
      ? addressOnly
      : 'No GPS metadata';

  return { title, subtitle };
}
