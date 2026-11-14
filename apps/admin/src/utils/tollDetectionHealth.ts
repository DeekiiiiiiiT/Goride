/**
 * Client-side toll detection health — flags the silent-zero failure mode
 * (detection on + verified plazas exist + no crossings in N days). Crossings are counted from the Roam ride
 * toll crossings themselves (toll-brain), not from the old toll logs.
 */
import type { TollPlaza } from '../types/toll';
import type { TollDispatchSettings } from '../services/platform/ridesDispatchSettingsService';

export const TOLL_HEALTH_WINDOW_DAYS = 7;

export type TollDetectionHealth = {
  detectionEnabled: boolean;
  verifiedPlazaCount: number;
  totalPlazaCount: number;
  /** null when the count could not be read. */
  crossingsLastNDays: number | null;
  windowDays: number;
  /** True when charging is blocked because nothing is verified. */
  verificationGateClosed: boolean;
  /** True when detection should be producing crossings but none appear. */
  zeroCrossingAlarm: boolean;
  summary: string;
};

export function assessTollDetectionHealth(input: {
  settings: Pick<TollDispatchSettings, 'toll_detection_enabled'> | null | undefined;
  plazas: TollPlaza[];
  /** Roam ride toll crossings recorded in the window (toll-brain /admin/crossing-count); null = unreadable. */
  crossingsLastNDays: number | null;
  windowDays?: number;
}): TollDetectionHealth {
  const windowDays = input.windowDays ?? TOLL_HEALTH_WINDOW_DAYS;
  const detectionEnabled = input.settings?.toll_detection_enabled === true;
  const verifiedPlazaCount = (input.plazas || []).filter((p) => p.status === 'verified').length;
  const totalPlazaCount = (input.plazas || []).length;

  const crossingsLastNDays = input.crossingsLastNDays;

  const verificationGateClosed = totalPlazaCount > 0 && verifiedPlazaCount === 0;
  const zeroCrossingAlarm =
    detectionEnabled && verifiedPlazaCount > 0 && crossingsLastNDays === 0;
  const countUnknown = crossingsLastNDays == null;

  let summary: string;
  if (verificationGateClosed) {
    summary =
      'Toll charging is off: no plazas are verified. Promote plazas in Toll Database or detection will stay at zero.';
  } else if (zeroCrossingAlarm) {
    summary = `No geofence/replay toll crossings in the last ${windowDays} days while detection is on and ${verifiedPlazaCount} plaza(s) are verified.`;
  } else if (countUnknown && detectionEnabled) {
    summary = `Couldn't read toll crossings · ${verifiedPlazaCount} verified plaza(s).`;
  } else if (!detectionEnabled) {
    summary = 'Toll detection is disabled in settings.';
  } else if (verifiedPlazaCount === 0) {
    summary = 'No toll plazas on file yet.';
  } else {
    summary = `${crossingsLastNDays} detected crossing(s) in the last ${windowDays} days · ${verifiedPlazaCount} verified plaza(s).`;
  }

  return {
    detectionEnabled,
    verifiedPlazaCount,
    totalPlazaCount,
    crossingsLastNDays,
    windowDays,
    verificationGateClosed,
    zeroCrossingAlarm,
    summary,
  };
}
