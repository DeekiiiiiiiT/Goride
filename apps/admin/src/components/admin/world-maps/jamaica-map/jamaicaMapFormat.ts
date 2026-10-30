export type ShapeRequest = {
  levels: string;
  tolerance: string;
  bbox?: string;
};

const TOLERANCE: Record<string, string> = {
  '1': '0.0005',
  '2': '0.0002',
  '3': '0.0001',
};

export function shapeRequests(
  zoom: number,
  bbox: [number, number, number, number] | null,
  layers: { parishes: boolean; towns: boolean; communities: boolean },
): ShapeRequest[] {
  const requests: ShapeRequest[] = [];
  if (layers.parishes) requests.push({ levels: '1', tolerance: TOLERANCE['1'] });
  if (layers.towns && zoom >= 10 && bbox) {
    requests.push({ levels: '2', tolerance: TOLERANCE['2'], bbox: bbox.join(',') });
  }
  if (layers.communities && zoom >= 12 && bbox) {
    requests.push({ levels: '3', tolerance: TOLERANCE['3'], bbox: bbox.join(',') });
  }
  return requests;
}

export function shapeUrl(request: ShapeRequest): string {
  const params = new URLSearchParams({ levels: request.levels, tolerance: request.tolerance });
  if (request.bbox) params.set('bbox', request.bbox);
  return `/geo/shapes?${params.toString()}`;
}

export function levelLabel(level: number): string {
  if (level <= 0) return 'Country';
  if (level === 1) return 'Parish';
  if (level === 2) return 'Town';
  return 'Community';
}

export function editorPageForLevel(level: number): string {
  if (level <= 1) return 'world-parishes';
  if (level === 2) return 'world-towns';
  return 'world-communities';
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Jamaica',
  }).format(date).replace(/ /g, ' ');
}

export function formatShortWhen(iso: string | null | undefined): string {
  const full = formatWhen(iso);
  if (full === '—') return full;
  return full.replace(/ \d{4}$/, '');
}

export function formatKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km²`;
}

export function formatPoints(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Math.round(Number(value)).toLocaleString('en-US');
}

export function formatCentre(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
  const west = lng < 0 ? `\u2212${Math.abs(lng).toFixed(4)}` : lng.toFixed(4);
  return `${lat.toFixed(4)}, ${west}`;
}

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'Manual';
  if (source === 'cod-ab') return 'COD-AB';
  return source;
}
