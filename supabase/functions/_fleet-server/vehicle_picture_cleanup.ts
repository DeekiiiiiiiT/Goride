import type { R2Client } from "../_shared/objectStorage/r2Client.ts";
import type { VehiclePictureDb } from "./vehicle_picture_db.ts";
import { runVehiclePictureStaleRefresh } from "./vehicle_picture_stale.ts";
import type { VehiclePicturesSettingsKv } from "./vehicle_pictures_settings.ts";

const MAX_DELETES_PER_RUN = 50;
const CLEANUP_MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function runVehiclePictureCleanup(opts: {
  db: VehiclePictureDb;
  r2: R2Client | null;
  retentionDays: number;
  now: Date;
  loadSettings?: () => Promise<VehiclePicturesSettingsKv>;
  saveSettings?: (patch: Partial<VehiclePicturesSettingsKv>) => Promise<void>;
}): Promise<number> {
  const { db, r2, retentionDays, now } = opts;
  const loadSettings = opts.loadSettings;
  const saveSettings = opts.saveSettings;

  let deleted = 0;
  let runFileCleanup = Boolean(r2);
  if (runFileCleanup && loadSettings && saveSettings) {
    const settings = await loadSettings();
    const lastRun = settings.vehicle_picture_cleanup_last_run_at;
    if (lastRun) {
      const elapsed = now.getTime() - Date.parse(lastRun);
      if (elapsed < CLEANUP_MIN_INTERVAL_MS) runFileCleanup = false;
    }
  }

  if (runFileCleanup && r2) {
    const candidates = await db.listCleanupDeleteCandidates(
      retentionDays,
      now,
      MAX_DELETES_PER_RUN,
    );
    const deletedAtIso = now.toISOString();

    for (const row of candidates) {
      try {
        await r2.remove("public", [row.r2Key]);
        await db.markVersionFileDeleted(row.pictureId, row.version, deletedAtIso);
        deleted += 1;
      } catch {
        // leave file_deleted_at null for retry
      }
    }

    if (saveSettings) {
      await saveSettings({ vehicle_picture_cleanup_last_run_at: now.toISOString() });
    }
  }

  await runVehiclePictureStaleRefresh({
    db,
    now,
    loadSettings,
    saveSettings,
  });

  return deleted;
}