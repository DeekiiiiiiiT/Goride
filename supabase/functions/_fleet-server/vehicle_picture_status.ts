import { publicMediaUrl } from "../_shared/objectStorage/index.ts";
import type { CatalogRow } from "../_shared/vehiclePictures/lookKey.ts";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import type { VehicleColor } from "../_shared/vehiclePictures/color.ts";
import {
  isPicturesPaused,
  type VehiclePicturesSettingsKv,
} from "./vehicle_pictures_settings.ts";
import type { FleetVehiclePictureContext, PicturePayload, VehiclePictureRow } from "./vehicle_picture_types.ts";

/** First instant of the next calendar month in Jamaica (for remake budget wall). */
export function jamaicaFirstOfNextMonth(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "2026");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const label = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return new Date(`${label}T00:00:00-05:00`);
}

/** Jamaica calendar day YYYY-MM-DD */
export function jamaicaPictureDay(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

export function isVehicleParkedForPictures(ctx: FleetVehiclePictureContext): boolean {
  const cat = ctx.vehicleCatalogId != null ? String(ctx.vehicleCatalogId).trim() : "";
  if (!cat) return true;
  if (ctx.catalogStatus === "pending_catalog") return true;
  return false;
}

export type PictureStatusInput = {
  vehicle: FleetVehiclePictureContext;
  settings: VehiclePicturesSettingsKv;
  now: Date;
  linkedPicture: VehiclePictureRow | null;
  liveLookPicture: VehiclePictureRow | null;
  geminiBudgetBlocked: boolean;
  orgAtDailyLimit: boolean;
};

function pausedForDisplay(
  settings: VehiclePicturesSettingsKv,
  now: Date,
  geminiBudgetBlocked: boolean,
): boolean {
  return isPicturesPaused(settings, now) || geminiBudgetBlocked;
}

function statusFromLinkedRow(
  row: VehiclePictureRow,
  paused: boolean,
): PicturePayload {
  if (row.status === "ready") {
    return { status: "ready", url: publicMediaUrl(row.r2_key) };
  }
  if (row.status === "failed") return { status: "failed", url: null };
  if (row.status === "generating") {
    return { status: paused ? "paused" : "generating", url: null };
  }
  return { status: paused ? "paused" : "queued", url: null };
}

/** §3.6 rows 1–7 (paused/limited computed; BN2 when picture_id null but live row exists). */
export function resolvePictureForVehicle(input: PictureStatusInput): PicturePayload {
  const { vehicle, settings, now, linkedPicture, liveLookPicture, geminiBudgetBlocked, orgAtDailyLimit } =
    input;
  const paused = pausedForDisplay(settings, now, geminiBudgetBlocked);

  if (vehicle.pictureId && linkedPicture) {
    if (linkedPicture.status === "ready") {
      return { status: "ready", url: publicMediaUrl(linkedPicture.r2_key) };
    }
    if (paused && (linkedPicture.status === "queued" || linkedPicture.status === "generating")) {
      return { status: "paused", url: null };
    }
    return statusFromLinkedRow(linkedPicture, paused);
  }

  if (!vehicle.pictureId && liveLookPicture) {
    return statusFromLinkedRow(liveLookPicture, paused);
  }

  const parked = isVehicleParkedForPictures(vehicle);
  const hasColour = Boolean(vehicle.colorStandard);
  const matched = Boolean(vehicle.vehicleCatalogId?.trim());
  const aiOn = settings.ai_vehicle_pictures === true;

  if (
    !vehicle.pictureId &&
    matched &&
    hasColour &&
    aiOn &&
    !liveLookPicture &&
    orgAtDailyLimit
  ) {
    return { status: "limited", url: null };
  }

  if (parked || !hasColour || (!aiOn && !liveLookPicture && linkedPicture?.status !== "ready")) {
    return { status: "none", url: null };
  }

  return { status: "none", url: null };
}

export function lookKeyForVehicle(catalog: CatalogRow, colorStandard: VehicleColor): string | null {
  const built = buildLook(catalog, colorStandard);
  if ("error" in built) return null;
  return built.key;
}