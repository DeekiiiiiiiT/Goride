type NavTarget = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
};

export type NavApp = 'google_maps' | 'waze';

function destinationParam(target: NavTarget): string {
  if (target.address?.trim()) return encodeURIComponent(target.address.trim());
  if (target.lat != null && target.lng != null) {
    return encodeURIComponent(`${target.lat},${target.lng}`);
  }
  return '';
}

export function openHaulNavigationApp(app: NavApp, target: NavTarget): void {
  const destination = destinationParam(target);
  if (!destination) return;

  const url =
    app === 'waze'
      ? `https://waze.com/ul?navigate=yes&destination=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openHaulNavigation(target: NavTarget): void {
  openHaulNavigationApp('google_maps', target);
}

export async function copyAddress(address: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(address);
    return true;
  } catch {
    return false;
  }
}
