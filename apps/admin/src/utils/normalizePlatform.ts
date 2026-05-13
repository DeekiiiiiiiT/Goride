/**
 * Normalizes legacy platform names to the current brand.
 * "GoRide" was the original app name — now rebranded to "Roam".
 * Use this wherever trip.platform is displayed or used as a grouping key.
 */
export function normalizePlatform(platform: string | undefined): string {
  if (!platform) return 'Other';
  return platform === 'GoRide' ? 'Roam' : platform;
}
