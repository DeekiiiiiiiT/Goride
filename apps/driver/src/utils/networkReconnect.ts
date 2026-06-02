/** Fired when the browser reports connectivity restored (debounced in useNetworkStatus). */
export const ROAM_RECONNECTED_EVENT = 'roam:reconnected';

/** Fired immediately when the browser reports offline. */
export const ROAM_OFFLINE_EVENT = 'roam:offline';

/** Ask mounted error boundaries to clear without a full page reload. */
export const ROAM_RESET_ERROR_BOUNDARY_EVENT = 'roam:reset-error-boundary';

export function dispatchRoamReconnected(): void {
  window.dispatchEvent(new CustomEvent(ROAM_RECONNECTED_EVENT));
}

export function dispatchRoamOffline(): void {
  window.dispatchEvent(new CustomEvent(ROAM_OFFLINE_EVENT));
}

export function dispatchResetErrorBoundary(): void {
  window.dispatchEvent(new CustomEvent(ROAM_RESET_ERROR_BOUNDARY_EVENT));
}
