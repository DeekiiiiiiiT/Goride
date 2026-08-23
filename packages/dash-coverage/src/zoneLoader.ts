import type { ActiveCoverageZone, LatLng } from './zonesPayload';

export function createDeliveryZoneLoader(opts: {
  fetchZones: () => Promise<ActiveCoverageZone[]>;
  readCache: () => ActiveCoverageZone[] | null;
  writeCache: (zones: ActiveCoverageZone[]) => void;
}) {
  let activeZones: ActiveCoverageZone[] = [];
  let loadPromise: Promise<LatLng[]> | null = null;
  let zonesHydrated = false;

  function getActivePolygon(): LatLng[] {
    const include = activeZones.find((z) => z.kind === 'include' && z.polygon.length >= 3);
    return include?.polygon ?? [];
  }

  function getActiveZones(): ActiveCoverageZone[] {
    return activeZones;
  }

  function setForTests(zones: ActiveCoverageZone[]): void {
    activeZones = zones;
    zonesHydrated = true;
    loadPromise = null;
  }

  async function load(): Promise<LatLng[]> {
    if (!loadPromise) {
      loadPromise = (async () => {
        const cached = opts.readCache();
        if (cached?.length) activeZones = cached;

        try {
          const zones = await opts.fetchZones();
          if (zones.length > 0) {
            activeZones = zones;
            opts.writeCache(zones);
          } else if (!cached?.length) {
            activeZones = [];
          }
        } catch {
          if (!cached?.length) activeZones = [];
        }

        zonesHydrated = true;
        return getActivePolygon();
      })().finally(() => {
        loadPromise = null;
      });
    }
    return loadPromise;
  }

  async function ensureLoaded(): Promise<void> {
    if (zonesHydrated && activeZones.length > 0) return;
    await load();
  }

  return {
    load,
    ensureLoaded,
    getActivePolygon,
    getActiveZones,
    setForTests,
  };
}
