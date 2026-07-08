/**
 * Normalizes legacy platform names to the current brand.
 * "GoRide" was the original app name — now rebranded to "Roam".
 * Use this wherever trip.platform is displayed or used as a grouping key.
 */
export function normalizePlatform(platform: string | undefined | null): string {
  if (!platform) return 'Other';
  const trimmed = String(platform).trim();
  if (!trimmed) return 'Other';
  if (trimmed === 'GoRide' || trimmed.toLowerCase() === 'goride') return 'Roam';
  // Canonical casing for comparison
  const lower = trimmed.toLowerCase();
  if (lower === 'uber') return 'Uber';
  if (lower === 'roam') return 'Roam';
  if (lower === 'indrive' || lower === 'in drive') return 'InDrive';
  return trimmed;
}

/** True when both platforms resolve to the same brand (case/legacy-safe). */
export function platformsEqual(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return false;
  return normalizePlatform(a) === normalizePlatform(b);
}
