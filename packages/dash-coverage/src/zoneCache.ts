import type { ActiveCoverageZone, LatLng } from './zonesPayload';

export type ZoneCacheStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function createZoneCache(opts: {
  storage: ZoneCacheStorage;
  key: string;
  ttlMs: number;
}) {
  const { storage, key, ttlMs } = opts;

  function read(): ActiveCoverageZone[] | null {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        at: number;
        zones?: ActiveCoverageZone[];
        polygons?: LatLng[][];
        polygon?: LatLng[];
      };
      if (Date.now() - parsed.at > ttlMs) return null;
      if (parsed.zones?.length) {
        return parsed.zones.filter((z) => z.polygon?.length >= 3);
      }
      if (parsed.polygons?.length) {
        return parsed.polygons
          .filter((p) => p.length >= 3)
          .map((polygon) => ({ kind: 'include' as const, polygon }));
      }
      if (parsed.polygon && parsed.polygon.length >= 3) {
        return [{ kind: 'include', polygon: parsed.polygon }];
      }
      return null;
    } catch {
      return null;
    }
  }

  function write(zones: ActiveCoverageZone[]): void {
    try {
      storage.setItem(
        key,
        JSON.stringify({
          at: Date.now(),
          zones,
          polygons: zones.filter((z) => z.kind === 'include').map((z) => z.polygon),
          polygon: zones.find((z) => z.kind === 'include')?.polygon,
        }),
      );
    } catch {
      // ignore quota / private mode
    }
  }

  return { read, write };
}
