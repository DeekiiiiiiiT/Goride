import { VEHICLE_COLORS, type VehicleColor } from "../_shared/vehiclePictures/color.ts";
import { publicMediaUrl } from "../_shared/objectStorage/index.ts";
import {
  loadVehiclePicturesSettings,
  type VehiclePicturesSettingsKv,
} from "./vehicle_pictures_settings.ts";
import {
  buildLookFromCatalog,
  createVehiclePictureDb,
  type VehiclePictureDb,
} from "./vehicle_picture_db.ts";
import { isVehicleParkedForPictures, resolvePictureForVehicle } from "./vehicle_picture_status.ts";
import type { FleetVehiclePictureContext, PicturePayload, VehiclePictureRow } from "./vehicle_picture_types.ts";
import { kickVehiclePictureWorker } from "./vehicle_picture_kick.ts";
import { checkProviderGuards, ProviderBlockedError } from "./api_usage_logger.ts";

export type PictureLookupInput = {
  vehicleId: string;
  organizationId: string;
  vehicleCatalogId: string | null;
  colorStandard: string | null;
  catalogStatus?: string | null;
  kickWorker?: boolean;
};

export type PictureLookupDeps = {
  now: () => Date;
  loadSettings: () => Promise<VehiclePicturesSettingsKv>;
  db: VehiclePictureDb;
  kickWorker: () => Promise<void>;
  geminiBudgetBlocked: () => Promise<boolean>;
};

export type PictureLookupResult = PicturePayload;

function rowToLookupResult(row: VehiclePictureRow): PictureLookupResult {
  if (row.status === "ready") {
    return { status: "ready", url: publicMediaUrl(row.r2_key) };
  }
  if (row.status === "failed") return { status: "failed", url: null };
  if (row.status === "generating") return { status: "generating", url: null };
  return { status: "queued", url: null };
}

export async function runPictureLookup(
  deps: PictureLookupDeps,
  input: PictureLookupInput,
): Promise<PictureLookupResult> {
  const now = deps.now();
  const settings = await deps.loadSettings();
  const ctx: FleetVehiclePictureContext = {
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    vehicleCatalogId: input.vehicleCatalogId,
    colorStandard: input.colorStandard,
    pictureId: null,
    catalogStatus: input.catalogStatus,
  };

  if (isVehicleParkedForPictures(ctx)) {
    return { status: "none", url: null };
  }

  if (!input.colorStandard || !(VEHICLE_COLORS as readonly string[]).includes(input.colorStandard)) {
    return { status: "none", url: null };
  }

  const color = input.colorStandard as VehicleColor;
  const catalogId = String(input.vehicleCatalogId ?? "").trim();
  if (!catalogId) return { status: "none", url: null };

  const catalog = await deps.db.getCatalogRow(catalogId);
  if (!catalog) return { status: "none", url: null };

  const built = buildLookFromCatalog(catalog, color);
  if ("error" in built) {
    console.error("[vehicle_picture_lookup] NON_LATIN_CATALOG_VALUE", input.vehicleId);
    return { status: "none", url: null };
  }

  let live = await deps.db.getLivePictureByLookKey(built.key);
  const readyExists = live?.status === "ready";

  if (!settings.ai_vehicle_pictures && !readyExists) {
    return { status: "none", url: null };
  }

  let insertedOrResurrected = false;

  if (!live) {
    const atLimit = await orgAtDailyLimit(deps, input.organizationId, settings, now);
    if (atLimit && !readyExists) {
      return { status: "limited", url: null };
    }

    const removed = await deps.db.getRemovedPictureByLookKey(built.key);
    if (removed) {
      const res = await deps.db.resurrectPicture(removed.id);
      if (res) {
        live = res;
        insertedOrResurrected = true;
      } else {
        live = await deps.db.getLivePictureByLookKey(built.key);
      }
    }

    if (!live) {
      const inserted = await deps.db.insertQueuedPicture(built, input.organizationId, catalogId);
      if (inserted) {
        live = inserted;
        insertedOrResurrected = true;
      } else {
        live = await deps.db.getLivePictureByLookKey(built.key);
        if (!live) {
          const removedAgain = await deps.db.getRemovedPictureByLookKey(built.key);
          if (removedAgain) {
            const res = await deps.db.resurrectPicture(removedAgain.id);
            if (res) {
              live = res;
              insertedOrResurrected = true;
            } else {
              live = await deps.db.getLivePictureByLookKey(built.key);
            }
          }
        }
      }
    }
  }

  if (!live) {
    return { status: "none", url: null };
  }

  await deps.db.setVehiclePictureId(input.vehicleId, live.id);

  if (insertedOrResurrected && input.kickWorker !== false) {
    await deps.kickWorker().catch((e) => console.warn("[vehicle_picture_lookup] worker kick failed", e));
  }

  return rowToLookupResult(live);
}

async function orgAtDailyLimit(
  deps: PictureLookupDeps,
  orgId: string,
  settings: VehiclePicturesSettingsKv,
  now: Date,
): Promise<boolean> {
  const max = settings.vehicle_picture_org_daily_max ?? 50;
  const count = await deps.db.countOrgQueuedToday(orgId, now);
  return count >= max;
}

export async function readPicturesForVehiclesBatch(
  deps: PictureLookupDeps,
  vehicles: Array<FleetVehiclePictureContext & { pictureId: string | null }>,
): Promise<Map<string, PictureLookupResult>> {
  const out = new Map<string, PictureLookupResult>();
  if (!vehicles.length) return out;

  const now = deps.now();
  const settings = await deps.loadSettings();
  const blocked = await deps.geminiBudgetBlocked().catch(() => false);
  const maxPerOrg = settings.vehicle_picture_org_daily_max ?? 50;

  const pictureIds = [
    ...new Set(
      vehicles.map((v) => (v.pictureId ? String(v.pictureId).trim() : "")).filter(Boolean),
    ),
  ];
  const linkedById = await deps.db.getPicturesByIdsIn(pictureIds);

  const orgIds = [...new Set(vehicles.map((v) => String(v.organizationId).trim()).filter(Boolean))];
  const orgDayCount = new Map<string, number>();
  for (const orgId of orgIds) {
    const count = await deps.db.countOrgQueuedToday(orgId, now);
    orgDayCount.set(orgId, count);
  }

  const needLook = vehicles.filter((v) => !v.pictureId && v.vehicleCatalogId && v.colorStandard);
  const catalogIds = [
    ...new Set(needLook.map((v) => String(v.vehicleCatalogId).trim()).filter(Boolean)),
  ];
  const catalogs = await deps.db.getCatalogRowsIn(catalogIds);

  const lookKeyByVehicleId = new Map<string, string>();
  for (const v of needLook) {
    const catId = String(v.vehicleCatalogId).trim();
    const catalog = catalogs.get(catId);
    if (!catalog || !v.colorStandard) continue;
    if (!(VEHICLE_COLORS as readonly string[]).includes(v.colorStandard)) continue;
    const built = buildLookFromCatalog(catalog, v.colorStandard as VehicleColor);
    if (!("error" in built)) {
      lookKeyByVehicleId.set(v.vehicleId, built.key);
    }
  }

  const liveByLookKey = await deps.db.getLivePicturesByLookKeysIn([...lookKeyByVehicleId.values()]);

  for (const vehicle of vehicles) {
    const linked = vehicle.pictureId ? linkedById.get(vehicle.pictureId) ?? null : null;
    let liveLook: VehiclePictureRow | null = null;
    if (!vehicle.pictureId) {
      const key = lookKeyByVehicleId.get(vehicle.vehicleId);
      if (key) liveLook = liveByLookKey.get(key) ?? null;
    }
    const orgCount = orgDayCount.get(vehicle.organizationId) ?? 0;
    const orgAtDailyLimit = orgCount >= maxPerOrg;

    const picture = resolvePictureForVehicle({
      vehicle,
      settings,
      now,
      linkedPicture: linked,
      liveLookPicture: liveLook,
      geminiBudgetBlocked: blocked,
      orgAtDailyLimit,
    });
    out.set(vehicle.vehicleId, picture);
  }

  return out;
}

export async function readPictureForVehicle(
  deps: PictureLookupDeps,
  vehicle: FleetVehiclePictureContext & { pictureId: string | null },
): Promise<PictureLookupResult> {
  const batch = await readPicturesForVehiclesBatch(deps, [vehicle]);
  return batch.get(vehicle.vehicleId) ?? { status: "none", url: null };
}

export function createProductionPictureLookupDeps(
  supabase: Parameters<typeof createVehiclePictureDb>[0],
): PictureLookupDeps {
  return {
    now: () => new Date(),
    loadSettings: loadVehiclePicturesSettings,
    db: createVehiclePictureDb(supabase),
    kickWorker: () => kickVehiclePictureWorker(supabase),
    geminiBudgetBlocked: async () => {
      try {
        await checkProviderGuards("gemini");
        return false;
      } catch (e) {
        return e instanceof ProviderBlockedError;
      }
    },
  };
}