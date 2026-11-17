import {
  loadVehiclePicturesSettings,
  saveVehiclePicturesSettings,
  type VehiclePicturesSettingsKv,
} from "./vehicle_pictures_settings.ts";
import type { VehiclePictureDb } from "./vehicle_picture_db.ts";
import {
  runPictureLookup,
  type PictureLookupDeps,
} from "./vehicle_picture_lookup.ts";
import { kickVehiclePictureFill, kickVehiclePictureWorker } from "./vehicle_picture_kick.ts";
import { runVehiclePictureStaleRefresh } from "./vehicle_picture_stale.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BATCH_SIZE = 200;
const CURSOR_MAX_AGE_MS = 60 * 60 * 1000;

export type FillDeps = {
  now: () => Date;
  lookupDeps: PictureLookupDeps;
  db: VehiclePictureDb;
  supabase: SupabaseClient;
  loadSettings?: () => ReturnType<typeof loadVehiclePicturesSettings>;
  saveSettings?: (patch: Partial<VehiclePicturesSettingsKv>) => Promise<void>;
  saveFillCursor?: (cursor: { afterId: string; startedAt: string } | null) => Promise<void>;
};

export type FillInput = {
  afterId?: string | null;
};

export async function runVehiclePictureFill(deps: FillDeps, input: FillInput): Promise<{ skipped: boolean }> {
  const runId = crypto.randomUUID();
  const heldUntil = new Date(deps.now().getTime() + 120_000).toISOString();
  const got = await deps.db.tryAcquireWorkerLease(runId, heldUntil);
  if (!got) return { skipped: true };

  try {
    const settings = await (deps.loadSettings ?? loadVehiclePicturesSettings)();
    const saveCursor = deps.saveFillCursor ??
      (async (cursor) => {
        await saveVehiclePicturesSettings({ vehicle_picture_fill_cursor: cursor });
      });
    let afterId = input.afterId?.trim() || settings.vehicle_picture_fill_cursor?.afterId || null;

    const rows = await deps.db.listVehiclesNeedingPicture(afterId, BATCH_SIZE);

    for (const v of rows) {
      await runPictureLookup(deps.lookupDeps, {
        vehicleId: v.id,
        organizationId: v.organization_id,
        vehicleCatalogId: v.vehicle_catalog_id,
        colorStandard: v.color_standard,
        kickWorker: false,
      });
    }

    const full = rows.length >= BATCH_SIZE;
    if (full && rows.length) {
      const lastId = rows[rows.length - 1]!.id;
      await saveCursor({
        afterId: lastId,
        startedAt: settings.vehicle_picture_fill_cursor?.startedAt ?? deps.now().toISOString(),
      });
      await deps.db.releaseWorkerLease(runId);
      await kickVehiclePictureFill(deps.supabase, lastId);
      return { skipped: false };
    }

    await saveCursor(null);
    await runVehiclePictureStaleRefresh({
      db: deps.db,
      now: deps.now(),
      loadSettings: deps.loadSettings ?? loadVehiclePicturesSettings,
      saveSettings: deps.saveSettings ?? (async (patch) => saveVehiclePicturesSettings(patch)),
      force: true,
    });
    await deps.db.releaseWorkerLease(runId);
    await kickVehiclePictureWorker(deps.supabase);
    return { skipped: false };
  } catch (e) {
    await deps.db.releaseWorkerLease(runId);
    throw e;
  }
}

export function fillCursorExpired(startedAt: string | undefined, now: Date): boolean {
  if (!startedAt) return true;
  const t = Date.parse(startedAt);
  return !Number.isFinite(t) || now.getTime() - t > CURSOR_MAX_AGE_MS;
}