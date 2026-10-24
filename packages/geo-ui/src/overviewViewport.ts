export type LatLng = { lat: number; lng: number };
export type LatLngBox = { south: number; north: number; west: number; east: number };

export function ringBox(path: LatLng[]): LatLngBox | null {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  let n = 0;
  for (const v of path) {
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue;
    south = Math.min(south, v.lat);
    north = Math.max(north, v.lat);
    west = Math.min(west, v.lng);
    east = Math.max(east, v.lng);
    n += 1;
  }
  if (n === 0) return null;
  return { south, north, west, east };
}

export function boxesOverlap(a: LatLngBox, b: LatLngBox): boolean {
  return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
}

export function pointInBox(point: LatLng, box: LatLngBox): boolean {
  return point.lat >= box.south && point.lat <= box.north && point.lng >= box.west && point.lng <= box.east;
}

/**
 * One Google polygon per outer ring. Following exclude rings are holes on that polygon.
 * A hole with no outer ring is dropped so it cannot be painted as a cutout.
 */
export function groupRingsForOutline(
  rings: { kind?: string; polygon?: LatLng[] | null }[] | undefined,
): LatLng[][][] {
  const polygons: LatLng[][][] = [];
  let current: LatLng[][] | null = null;
  for (const ring of rings ?? []) {
    const path = (ring.polygon ?? []).filter(
      (v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng),
    );
    if (path.length < 3) continue;
    if (ring.kind === 'exclude') {
      if (current) current.push(path);
      continue;
    }
    if (current) polygons.push(current);
    current = [path];
  }
  if (current) polygons.push(current);
  return polygons;
}

/** Town shape is worth drawing when its center or any ring box meets the current map view. */
export function shapeIntersectsView(
  rings: { polygon?: LatLng[] | null }[] | undefined,
  center: LatLng | null,
  view: LatLngBox,
): boolean {
  if (center && pointInBox(center, view)) return true;
  for (const ring of rings ?? []) {
    const box = ringBox(ring.polygon ?? []);
    if (box && boxesOverlap(box, view)) return true;
  }
  return false;
}
