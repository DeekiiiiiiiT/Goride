export type NavApp = 'google' | 'waze' | 'apple';

export type NavTarget = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
};

/** Build deep-link / web URL for external navigation apps. */
export function buildNavigationUrl(app: NavApp, target: NavTarget): string {
  const lat = target.lat != null && Number.isFinite(Number(target.lat)) ? Number(target.lat) : null;
  const lng = target.lng != null && Number.isFinite(Number(target.lng)) ? Number(target.lng) : null;
  const address = (target.address || '').trim();
  const hasCoords = lat != null && lng != null;
  const query = hasCoords ? `${lat},${lng}` : encodeURIComponent(address || 'Kingston, Jamaica');

  switch (app) {
    case 'waze':
      return hasCoords
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://waze.com/ul?q=${query}&navigate=yes`;
    case 'apple':
      return hasCoords
        ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
        : `https://maps.apple.com/?daddr=${query}&dirflg=d`;
    case 'google':
    default:
      return hasCoords
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  }
}

export function openNavigationApp(app: NavApp, target: NavTarget): void {
  const url = buildNavigationUrl(app, target);
  window.open(url, '_blank', 'noopener,noreferrer');
}
