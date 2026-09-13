export type VehicleServiceLine = 'rideshare' | 'rush_delivery';

type VehicleLike = {
  serviceLines?: unknown;
  service_lines?: unknown;
};

function asLineArray(raw: unknown): VehicleServiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is VehicleServiceLine => l === 'rideshare' || l === 'rush_delivery');
}

/** Empty/missing → rideshare (legacy vehicles). */
export function vehicleServiceLines(v: VehicleLike | null | undefined): VehicleServiceLine[] {
  if (!v) return ['rideshare'];
  const lines = asLineArray(v.serviceLines ?? v.service_lines);
  return lines.length ? lines : ['rideshare'];
}

export function vehicleMatchesLine(
  v: VehicleLike | null | undefined,
  line: VehicleServiceLine,
): boolean {
  return vehicleServiceLines(v).includes(line);
}

export function personMatchesServiceLine(
  person: { serviceLines?: unknown; service_lines?: unknown } | null | undefined,
  line: VehicleServiceLine,
): boolean {
  const raw = person?.serviceLines ?? person?.service_lines;
  const lines = asLineArray(raw);
  if (line === 'rush_delivery') return lines.includes('rush_delivery');
  // rideshare: legacy empty OR explicit rideshare
  if (!lines.length) return true;
  return lines.includes('rideshare');
}
