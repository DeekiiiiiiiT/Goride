/**
 * Opt-in native geofence arrival prompt (Phase 3).
 * When the vehicle stops >60s inside a verified station, show a local notification.
 * Wiring is opt-in via localStorage flag so it never surprises drivers.
 */

export const FUEL_GEOFENCE_PROMPT_FLAG = 'roam:driver:fuelGeofencePrompt';

export function isFuelGeofencePromptEnabled(): boolean {
  try {
    return localStorage.getItem(FUEL_GEOFENCE_PROMPT_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setFuelGeofencePromptEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(FUEL_GEOFENCE_PROMPT_FLAG, '1');
    else localStorage.removeItem(FUEL_GEOFENCE_PROMPT_FLAG);
  } catch {
    /* ignore */
  }
}

export type GeofenceStopEvent = {
  stationId: string;
  stationName: string;
  stoppedForMs: number;
};

/**
 * Pure helper: given dwell time inside a station fence, decide whether to notify.
 */
export function shouldPromptFuelLog(event: GeofenceStopEvent): boolean {
  return event.stoppedForMs >= 60_000 && !!event.stationId;
}

export function fuelLogNotificationBody(stationName: string): string {
  return `At ${stationName}? Tap to log fuel.`;
}
