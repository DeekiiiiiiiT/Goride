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

export const UNSUPPORTED_ACTIVITY_PLATFORMS = new Set([
  'uber',
  'indrive',
  'in drive',
  'in_drive',
]);

export function isUnsupportedActivityPlatform(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return UNSUPPORTED_ACTIVITY_PLATFORMS.has(platform.trim().toLowerCase());
}
