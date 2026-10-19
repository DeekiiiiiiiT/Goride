/** OSM / CARTO tile URLs for Leaflet maps. CARTO raster tiles require VITE_CARTO_API_KEY. */

function cartoKey(): string {
  try {
    return String((import.meta as ImportMeta).env?.VITE_CARTO_API_KEY || '').trim();
  } catch {
    return '';
  }
}

function withCartoKey(url: string): string {
  const key = cartoKey();
  if (!key) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(key)}`;
}

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export const MAP_TILES = {
  LIGHT: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  /** Appends ?key= when VITE_CARTO_API_KEY is set (required since CARTO key enforcement). */
  get DARK(): string {
    return withCartoKey(CARTO_DARK);
  },
  ATTRIBUTION:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};
