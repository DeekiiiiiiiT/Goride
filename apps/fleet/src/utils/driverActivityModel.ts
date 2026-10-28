/**
 * Client-side Activity helpers only.
 * Segment/coverage/vocabulary logic lives on the edge:
 * supabase/functions/_fleet-server/driver_activity_logic.ts
 */

export type CoverageWindow = {
  from: string;
  to: string | null;
  recorded: boolean;
  reason?: string;
};

export type CoverageHonesty = {
  presenceRecorded: boolean;
  tripsRecorded: boolean;
  message?: string;
};

/** InDrive still has no per-event timeline. Uber is supported via app timeline import. */
export const UNSUPPORTED_ACTIVITY_PLATFORMS = new Set([
  'indrive',
  'in drive',
  'in_drive',
]);

/** When the driver header filters to Uber, Activity APIs should read service_line=uber. */
export function activityServiceLinesForPlatform(
  platform: string | null | undefined,
  allLines = 'roam_rides,roam_rush,fleet_ops,uber',
): string {
  if (!platform) return allLines;
  const p = platform.trim().toLowerCase();
  if (p === 'uber') return 'uber';
  return allLines;
}

export function isUnsupportedActivityPlatform(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return UNSUPPORTED_ACTIVITY_PLATFORMS.has(platform.trim().toLowerCase());
}
