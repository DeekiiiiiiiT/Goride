import * as kv from "./kv_store.tsx";

export const VEHICLE_PICTURES_SETTINGS_KEY = "vehicle_pictures:settings";

export type VehiclePictureFillCursor = {
  afterId: string;
  startedAt: string;
};

export type VehiclePictureOutageStreak = {
  count: number;
  firstAt: string;
};

const OUTAGE_WINDOW_MS = 10 * 60 * 1000;
const OUTAGE_BREAKER_COUNT = 5;

export type VehiclePicturesSettingsKv = {
  reader_provider?: string;
  reader_model?: string;
  vehicle_picture_model?: string;
  vehicle_picture_max_attempts?: number;
  vehicle_pictures_paused_until?: string | null;
  vehicle_pictures_pause_reason?: string | null;
  vehicle_picture_org_daily_max?: number;
  vehicle_picture_retention_days?: number;
  vehicle_picture_fill_cursor?: VehiclePictureFillCursor | null;
  vehicle_picture_outage_streak?: unknown;
  vehicle_picture_cleanup_last_run_at?: string | null;
  vehicle_picture_stale_last_run_at?: string | null;
  ai_vehicle_pictures?: boolean;
};

export const DEFAULT_VEHICLE_PICTURES_SETTINGS: Required<
  Pick<
    VehiclePicturesSettingsKv,
  | "reader_provider"
  | "reader_model"
  | "vehicle_picture_model"
  | "vehicle_picture_max_attempts"
  | "vehicle_picture_org_daily_max"
  | "vehicle_picture_retention_days"
  | "ai_vehicle_pictures"
  >
> = {
  reader_provider: "gemini",
  reader_model: "gemini-3.8-flash",
  vehicle_picture_model: "gemini-3.1-flash-image",
  vehicle_picture_max_attempts: 3,
  vehicle_picture_org_daily_max: 50,
  vehicle_picture_retention_days: 30,
  ai_vehicle_pictures: false,
};

export function mergeVehiclePicturesSettings(
  raw: VehiclePicturesSettingsKv | null | undefined,
): VehiclePicturesSettingsKv & typeof DEFAULT_VEHICLE_PICTURES_SETTINGS {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    ...DEFAULT_VEHICLE_PICTURES_SETTINGS,
    ...base,
    reader_provider: typeof base.reader_provider === "string" && base.reader_provider.trim()
      ? base.reader_provider.trim()
      : DEFAULT_VEHICLE_PICTURES_SETTINGS.reader_provider,
    reader_model: typeof base.reader_model === "string" && base.reader_model.trim()
      ? base.reader_model.trim()
      : DEFAULT_VEHICLE_PICTURES_SETTINGS.reader_model,
    vehicle_picture_model:
      typeof base.vehicle_picture_model === "string" && base.vehicle_picture_model.trim()
        ? base.vehicle_picture_model.trim()
        : DEFAULT_VEHICLE_PICTURES_SETTINGS.vehicle_picture_model,
    vehicle_picture_max_attempts: Number.isFinite(Number(base.vehicle_picture_max_attempts))
      ? Number(base.vehicle_picture_max_attempts)
      : DEFAULT_VEHICLE_PICTURES_SETTINGS.vehicle_picture_max_attempts,
    vehicle_picture_org_daily_max: Number.isFinite(Number(base.vehicle_picture_org_daily_max))
      ? Number(base.vehicle_picture_org_daily_max)
      : DEFAULT_VEHICLE_PICTURES_SETTINGS.vehicle_picture_org_daily_max,
    vehicle_picture_retention_days: Number.isFinite(Number(base.vehicle_picture_retention_days))
      ? Number(base.vehicle_picture_retention_days)
      : DEFAULT_VEHICLE_PICTURES_SETTINGS.vehicle_picture_retention_days,
    ai_vehicle_pictures: base.ai_vehicle_pictures === true,
    vehicle_pictures_paused_until:
      typeof base.vehicle_pictures_paused_until === "string" ? base.vehicle_pictures_paused_until : null,
    vehicle_pictures_pause_reason:
      typeof base.vehicle_pictures_pause_reason === "string" ? base.vehicle_pictures_pause_reason : null,
    vehicle_picture_fill_cursor: normalizeFillCursor(base.vehicle_picture_fill_cursor),
  };
}

function normalizeFillCursor(raw: unknown): VehiclePictureFillCursor | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const afterId = String((raw as { afterId?: unknown }).afterId ?? "").trim();
  const startedAt = String((raw as { startedAt?: unknown }).startedAt ?? "").trim();
  if (!afterId || !startedAt) return null;
  return { afterId, startedAt };
}

export async function loadVehiclePicturesSettings(): Promise<
  VehiclePicturesSettingsKv & typeof DEFAULT_VEHICLE_PICTURES_SETTINGS
> {
  const raw = await kv.get(VEHICLE_PICTURES_SETTINGS_KEY);
  return mergeVehiclePicturesSettings(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as VehiclePicturesSettingsKv)
      : {},
  );
}

export async function saveVehiclePicturesSettings(
  patch: Partial<VehiclePicturesSettingsKv>,
): Promise<void> {
  const current = await loadVehiclePicturesSettings();
  const next = { ...current, ...patch };
  await kv.set(VEHICLE_PICTURES_SETTINGS_KEY, next);
}

export function isPicturesPaused(settings: VehiclePicturesSettingsKv, now: Date): boolean {
  const until = settings.vehicle_pictures_paused_until;
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

function parseOutageStreak(raw: unknown): VehiclePictureOutageStreak | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const count = Number((raw as VehiclePictureOutageStreak).count);
  const firstAt = String((raw as VehiclePictureOutageStreak).firstAt ?? "");
  if (!Number.isFinite(count) || count < 1 || !firstAt) return null;
  return { count, firstAt };
}

/** After an outage-class failure: update streak and return whether the circuit breaker should trip. */
export function bumpOutageStreak(
  streak: VehiclePictureOutageStreak | null | undefined,
  now: Date,
): { streak: VehiclePictureOutageStreak; tripBreaker: boolean } {
  const nowIso = now.toISOString();
  let next: VehiclePictureOutageStreak;
  const parsed = streak ? parseOutageStreak(streak) : null;
  if (!parsed || now.getTime() - Date.parse(parsed.firstAt) > OUTAGE_WINDOW_MS) {
    next = { count: 1, firstAt: nowIso };
  } else {
    next = { count: parsed.count + 1, firstAt: parsed.firstAt };
  }
  return { streak: next, tripBreaker: next.count >= OUTAGE_BREAKER_COUNT };
}

export function clearedOutageStreak(): null {
  return null;
}