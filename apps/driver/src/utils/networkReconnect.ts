/** Fired when the browser reports connectivity restored (debounced in useNetworkStatus). */
export const ROAM_RECONNECTED_EVENT = 'roam:reconnected';

/** Fired immediately when the browser reports offline. */
export const ROAM_OFFLINE_EVENT = 'roam:offline';

/** Ask mounted error boundaries to clear without a full page reload. */
export const ROAM_RESET_ERROR_BOUNDARY_EVENT = 'roam:reset-error-boundary';

/** Clear local trip UI state (session snapshot); server ride may still be active until ops cancels. */
export const ROAM_EXIT_TRIP_UI_EVENT = 'roam:driver-exit-trip-ui';

export function dispatchRoamReconnected(): void {
  window.dispatchEvent(new CustomEvent(ROAM_RECONNECTED_EVENT));
}

export function dispatchRoamOffline(): void {
  window.dispatchEvent(new CustomEvent(ROAM_OFFLINE_EVENT));
}

export function dispatchResetErrorBoundary(): void {
  window.dispatchEvent(new CustomEvent(ROAM_RESET_ERROR_BOUNDARY_EVENT));
}

export function dispatchExitTripUi(): void {
  window.dispatchEvent(new CustomEvent(ROAM_EXIT_TRIP_UI_EVENT));
}
