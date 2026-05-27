type NavTarget = {
  lat: number;
  lng: number;
  address?: string | null;
};

export function buildGoogleMapsDirectionsUrl({ lat, lng, address }: NavTarget): string {
  const destination =
    address?.trim()
      ? encodeURIComponent(address.trim())
      : encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export function buildWazeUrl({ lat, lng }: NavTarget): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/** Opens turn-by-turn navigation in Google Maps (new tab). */
export function openExternalNavigation(target: NavTarget): void {
  const url = buildGoogleMapsDirectionsUrl(target);
  window.open(url, '_blank', 'noopener,noreferrer');
}
