import { vehicleMatchesLine, type VehicleServiceLine } from './vehicleServiceLines';

/**
 * Integrity service-line lens: filter which vehicles are in scope.
 * Dual-line vehicles appear in BOTH tabs with their COMPLETE fill chain —
 * never filter fills inside a chain (that fabricates gap flags).
 */
export function integrityVehiclesForLine<T extends { id?: string; serviceLines?: unknown; service_lines?: unknown }>(
  vehicles: T[],
  line: VehicleServiceLine | 'all',
): T[] {
  if (line === 'all') return vehicles;
  return vehicles.filter((v) => vehicleMatchesLine(v, line));
}

/**
 * Regression helper: flag-set identity for a dual-line vehicle must match across lenses.
 */
export function integrityFlagSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((id, i) => id === sb[i]);
}
