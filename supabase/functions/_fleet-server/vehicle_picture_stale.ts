import { catalogLookBaseKey, lookKeyBase } from "../_shared/vehiclePictures/lookKey.ts";
import type { VehiclePictureDb } from "./vehicle_picture_db.ts";
import type { VehiclePicturesSettingsKv } from "./vehicle_pictures_settings.ts";

const STALE_PAGE_SIZE = 1000;
const STALE_MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function runVehiclePictureStaleRefresh(opts: {
  db: VehiclePictureDb;
  now: Date;
  loadSettings?: () => Promise<VehiclePicturesSettingsKv>;
  saveSettings?: (patch: Partial<VehiclePicturesSettingsKv>) => Promise<void>;
  force?: boolean;
}): Promise<number> {
  const { db, now, force } = opts;
  const loadSettings = opts.loadSettings;
  const saveSettings = opts.saveSettings;

  if (!force && loadSettings) {
    const settings = await loadSettings();
    const lastRun = settings.vehicle_picture_stale_last_run_at;
    if (lastRun) {
      const elapsed = now.getTime() - Date.parse(lastRun);
      if (elapsed < STALE_MIN_INTERVAL_MS) return 0;
    }
  }

  const catalogs = await db.listCatalogRowsForStaleLooks();
  const activeBases = new Set<string>();
  for (const row of catalogs) {
    const base = catalogLookBaseKey(row);
    if (typeof base === "string") activeBases.add(base);
  }

  const staleIds: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await db.listLivePictureIdsAndLookKeysPage(offset, STALE_PAGE_SIZE);
    if (!page.length) break;
    for (const { id, look_key } of page) {
      if (!activeBases.has(lookKeyBase(look_key))) staleIds.push(id);
    }
    if (page.length < STALE_PAGE_SIZE) break;
    offset += STALE_PAGE_SIZE;
  }

  await db.setStalePictureIds(staleIds);

  if (saveSettings) {
    await saveSettings({ vehicle_picture_stale_last_run_at: now.toISOString() });
  }

  return staleIds.length;
}