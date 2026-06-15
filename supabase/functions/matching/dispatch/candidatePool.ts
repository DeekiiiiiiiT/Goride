/**
 * Candidate Pool Builder
 *
 * Filters and ranks available drivers for a matching wave.
 */

import { type DriverLocation } from "../supply/loadLocations.ts";
import type { ResolvedPolicy } from "../policy/loadPolicy.ts";
import { getEligibleDriverUserIds } from "../../_shared/driverModeFilter.ts";

export interface Candidate {
  user_id: string;
  lat: number;
  lng: number;
  haversineKm: number;
  body_type_slug: string | null;
}

export interface CandidatePoolResult {
  candidates: Candidate[];
  stats: {
    total_locations: number;
    eligible_count: number;
    excluded_count: number;
    filtered_body_type: number;
    in_radius: number;
  };
}

/**
 * Haversine formula to calculate distance between two lat/lng points.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LEGACY_BODY_TYPE_SLUGS: Record<string, string> = {
  standard: "sedan",
};

function normalizeBodyTypeSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const normalized = slug.trim().toLowerCase();
  return LEGACY_BODY_TYPE_SLUGS[normalized] ?? normalized;
}

/**
 * Build candidate pool for a matching wave.
 *
 * Filters by:
 * - Excluded driver IDs (already offered, declined, etc.)
 * - Driver eligibility (mode, profile status)
 * - Body type matching (if enabled)
 * - Distance radius
 *
 * Sorts by distance, then user_id for stable ordering.
 */
export async function buildCandidatePool(
  locations: DriverLocation[],
  pickupLat: number,
  pickupLng: number,
  radiusKm: number,
  excludedDriverIds: Set<string>,
  policy: ResolvedPolicy,
  allowedBodySlugs: Set<string>,
  tiersCount: number,
): Promise<CandidatePoolResult> {
  const eligibleIds = await getEligibleDriverUserIds(
    locations.map((loc) => loc.user_id),
    policy,
  );

  const candidates: Candidate[] = [];
  let filteredOutBodyType = 0;

  for (const loc of locations) {
    if (excludedDriverIds.has(loc.user_id)) continue;
    if (!eligibleIds.has(loc.user_id)) continue;

    const rawBodySlug = loc.body_type_slug;
    const bodySlug = rawBodySlug ??
      (tiersCount > 0 ? (normalizeBodyTypeSlug("standard") ?? "sedan") : null);

    if (tiersCount > 0) {
      if (!bodySlug) {
        if (policy.require_body_type_for_offers) {
          filteredOutBodyType++;
          continue;
        }
      } else if (!allowedBodySlugs.has(bodySlug)) {
        filteredOutBodyType++;
        continue;
      }
    }

    const d = haversineKm(pickupLat, pickupLng, loc.lat, loc.lng);
    if (d <= radiusKm) {
      candidates.push({
        user_id: loc.user_id,
        lat: loc.lat,
        lng: loc.lng,
        haversineKm: d,
        body_type_slug: bodySlug,
      });
    }
  }

  candidates.sort((a, b) => a.haversineKm - b.haversineKm || a.user_id.localeCompare(b.user_id));

  return {
    candidates,
    stats: {
      total_locations: locations.length,
      eligible_count: eligibleIds.size,
      excluded_count: excludedDriverIds.size,
      filtered_body_type: filteredOutBodyType,
      in_radius: candidates.length,
    },
  };
}

/**
 * Apply fairness rotation to candidates based on wave number.
 */
export function rotateCandidates(candidates: Candidate[], wave: number): Candidate[] {
  if (candidates.length === 0) return [];
  const rotate = wave % candidates.length;
  return [...candidates.slice(rotate), ...candidates.slice(0, rotate)];
}

/**
 * Check if there are unoffered candidates remaining at the current wave.
 * Used for serial dispatch to decide whether to retry same wave or advance.
 */
export function hasUnofferedCandidates(
  candidates: Candidate[],
  offeredDriverIds: Set<string>,
): boolean {
  return candidates.some((c) => !offeredDriverIds.has(c.user_id));
}
