/**
 * Unique Verified (GOD) station match from merchant / vendor strings.
 * Used by Silent Attach auto-heal — never attaches on ambiguous two-station ties.
 */

import {
  calculateSimilarity,
  normalizeVendorName,
} from "./vendor_matcher.ts";

export type MerchantMatchStation = {
  id: string;
  name?: string;
  brand?: string;
  status?: string;
  aliases?: Array<{ label?: string } | string>;
};

export type UniqueMerchantMatch = {
  station: MerchantMatchStation;
  score: number;
  merchantText: string;
};

const DEFAULT_MIN_SCORE = 0.88;
const UNIQUENESS_GAP = 0.08;
const FIRST_FILL_MIN_SCORE = 0.92;

/** Collect merchant-like strings from a fuel entry or transaction. */
export function collectMerchantCandidateTexts(record: Record<string, unknown>): string[] {
  const meta = (record.metadata || {}) as Record<string, unknown>;
  const raw = [
    record.vendor,
    record.location,
    record.merchant,
    meta.jaaStation,
    meta.jaaVendorRaw,
    meta.jaaDescription,
    meta.originalVendor,
    meta.stationName,
    meta.stationLocation,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = String(v || "").trim();
    if (!s) continue;
    const key = normalizeVendorName(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function aliasLabel(alias: { label?: string } | string): string {
  if (typeof alias === "string") return alias;
  return String(alias?.label || "");
}

function scoreStationAgainstText(station: MerchantMatchStation, text: string): number {
  let score = Math.max(
    calculateSimilarity(text, station.name || ""),
    calculateSimilarity(text, station.brand || ""),
  );
  for (const alias of station.aliases || []) {
    score = Math.max(score, calculateSimilarity(text, aliasLabel(alias)));
  }
  return score;
}

/**
 * Best unique Verified GOD station for a merchant string.
 * Accepts only when top score ≥ minScore and runner-up is ≥ uniquenessGap below.
 */
export function matchUniqueVerifiedStation(
  merchantText: string,
  stations: MerchantMatchStation[],
  minScore: number = DEFAULT_MIN_SCORE,
): UniqueMerchantMatch | null {
  const raw = String(merchantText || "").trim();
  if (!raw || !stations.length) return null;

  const verified = stations.filter((s) => !s.status || s.status === "verified");
  if (!verified.length) return null;

  const scored: Array<{ station: MerchantMatchStation; score: number }> = [];
  for (const station of verified) {
    if (!station.id) continue;
    const score = scoreStationAgainstText(station, raw);
    if (score >= minScore) scored.push({ station, score });
  }
  if (!scored.length) return null;

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runner = scored[1];
  if (runner && top.score - runner.score < UNIQUENESS_GAP) {
    return null; // ambiguous two-station tie
  }

  return {
    station: top.station,
    score: top.score,
    merchantText: raw,
  };
}

/**
 * Try all merchant candidate strings on a record; return best unique match.
 * Uses a higher threshold when `preferStrong` (e.g. first fill / no odo neighbor).
 */
export function matchUniqueVerifiedStationForRecord(
  record: Record<string, unknown>,
  stations: MerchantMatchStation[],
  opts?: { preferStrong?: boolean; minScore?: number },
): UniqueMerchantMatch | null {
  const minScore = opts?.minScore ??
    (opts?.preferStrong ? FIRST_FILL_MIN_SCORE : DEFAULT_MIN_SCORE);
  const texts = collectMerchantCandidateTexts(record);
  let best: UniqueMerchantMatch | null = null;
  for (const text of texts) {
    const hit = matchUniqueVerifiedStation(text, stations, minScore);
    if (!hit) continue;
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

export const MERCHANT_MATCH_DEFAULTS = {
  minScore: DEFAULT_MIN_SCORE,
  uniquenessGap: UNIQUENESS_GAP,
  firstFillMinScore: FIRST_FILL_MIN_SCORE,
};
