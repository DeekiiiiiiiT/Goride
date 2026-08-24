import {
  draftZonesDifferFromPublished,
  normalizeDraftZonesFromAdmin,
  type AdminDraftZoneInput,
} from './adminZones.ts';
import { createMemoryZoneCache } from './memoryZoneCache.ts';
import { createDeliveryZoneLoader } from './zoneLoader.ts';
import {
  DELIVERY_ZONES_CACHE_TTL_MS,
  type ActiveCoverageZone,
} from './zonesPayload.ts';

export const ADMIN_PUBLISHED_CACHE_KEY = 'roam-admin-published-zones-v1';

export function createAdminCoverageLayers(opts: {
  fetchPublishedZones: () => Promise<ActiveCoverageZone[]>;
  cacheKey?: string;
  cacheTtlMs?: number;
}) {
  const cache = createMemoryZoneCache({
    key: opts.cacheKey ?? ADMIN_PUBLISHED_CACHE_KEY,
    ttlMs: opts.cacheTtlMs ?? DELIVERY_ZONES_CACHE_TTL_MS,
  });

  const publishedLoader = createDeliveryZoneLoader({
    fetchZones: opts.fetchPublishedZones,
    readCache: () => cache.read(),
    writeCache: (zones) => cache.write(zones),
  });

  function normalizeDraft(rows: AdminDraftZoneInput[], marketId?: string): ActiveCoverageZone[] {
    return normalizeDraftZonesFromAdmin(rows, marketId);
  }

  async function loadPublished(): Promise<ActiveCoverageZone[]> {
    await publishedLoader.ensureLoaded();
    if (publishedLoader.getActiveZones().length === 0) {
      await publishedLoader.load();
    }
    return publishedLoader.getActiveZones();
  }

  function getPublishedZones(): ActiveCoverageZone[] {
    return publishedLoader.getActiveZones();
  }

  function draftDiffersFromPublished(
    draftRows: AdminDraftZoneInput[],
    marketId: string,
  ): boolean {
    const published = getPublishedZones();
    if (!published.length) return false;
    const draft = normalizeDraft(draftRows, marketId);
    return draftZonesDifferFromPublished(draft, published, marketId);
  }

  return {
    normalizeDraft,
    loadPublished,
    getPublishedZones,
    draftDiffersFromPublished,
  };
}

export type AdminCoverageLayers = ReturnType<typeof createAdminCoverageLayers>;
