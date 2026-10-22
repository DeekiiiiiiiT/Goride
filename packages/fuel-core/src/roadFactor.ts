/** A straight line misses bends. About 1.3 is a road, and it stays an estimate. */
export const STRAIGHT_LINE_ROAD_FACTOR = 1.3;

export function straightLineRoadKm(straightKm: number): number {
  const km = Number(straightKm);
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.round(km * STRAIGHT_LINE_ROAD_FACTOR * 100) / 100;
}
