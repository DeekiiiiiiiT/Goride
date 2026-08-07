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
