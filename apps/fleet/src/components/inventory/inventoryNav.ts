/** Move to another Fleet page the same way the app's own links do (pushState + popstate). */
export function goToFleetPath(path: string): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const FUEL_CARDS_PATH = '/fuel-cards';
export const TOLL_TAGS_PATH = '/toll-tags';

export function vehiclePath(vehicleId: string): string {
  return `/vehicles/${encodeURIComponent(vehicleId)}`;
}
