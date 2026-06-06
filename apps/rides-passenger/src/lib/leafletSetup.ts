import L from 'leaflet';

let cssInjected = false;

export function ensureLeafletCss(): void {
  if (cssInjected || typeof document === 'undefined') return;
  if (document.querySelector('link[data-roam-leaflet]')) {
    cssInjected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.crossOrigin = '';
  link.dataset.roamLeaflet = 'true';
  document.head.appendChild(link);
  cssInjected = true;
}

export function fixLeafletDefaultIcons(): void {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

fixLeafletDefaultIcons();

export function pickupDivIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#059669;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function dropoffDivIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;background:#18181b;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export function driverDivIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
