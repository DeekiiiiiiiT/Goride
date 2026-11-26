/**
 * Part picture settings — `kv_store_37f42386.key = 'part_pictures:settings'` (docs/part-pictures-audit.md §2 D5).
 * Same shape as the car-picture settings, so the worker and S3 read the same fields.
 */
import * as kv from "./kv_store.tsx";

export const PART_PICTURES_SETTINGS_KEY = "part_pictures:settings";

export type PartPicturesSettingsKv = {
  /** The switch. Off by default (PP-11): no queue, no spend. */
  ai_part_pictures?: boolean;
  part_picture_model?: string;
  /** Attempts before a row is `failed`. */
  max_attempts?: number;
  /** Pictures made per Jamaica calendar day, across all uploads. */
  daily_max?: number;
  /** Days a diagram and an old version file are kept, so Remake works (PP-04). */
  retention_days?: number;
  part_pictures_paused_until?: string | null;
  part_pictures_pause_reason?: string | null;
  part_picture_cleanup_last_run_at?: string | null;
};

export const DEFAULT_PART_PICTURES_SETTINGS: {
  ai_part_pictures: boolean;
  part_picture_model: string;
  max_attempts: number;
  daily_max: number;
  retention_days: number;
} = {
  ai_part_pictures: false,
  part_picture_model: "gemini-3.1-flash-image",
  max_attempts: 3,
  daily_max: 50,
  retention_days: 30,
};

export type PartPicturesSettings = PartPicturesSettingsKv & typeof DEFAULT_PART_PICTURES_SETTINGS;

function positiveInt(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
}

export function mergePartPicturesSettings(raw: PartPicturesSettingsKv | null | undefined): PartPicturesSettings {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const model = typeof base.part_picture_model === "string" && base.part_picture_model.trim()
    ? base.part_picture_model.trim()
    : DEFAULT_PART_PICTURES_SETTINGS.part_picture_model;
  return {
    ...base,
    ai_part_pictures: base.ai_part_pictures === true,
    part_picture_model: model,
    max_attempts: positiveInt(base.max_attempts, DEFAULT_PART_PICTURES_SETTINGS.max_attempts, 10),
    daily_max: positiveInt(base.daily_max, DEFAULT_PART_PICTURES_SETTINGS.daily_max, 1000),
    retention_days: positiveInt(base.retention_days, DEFAULT_PART_PICTURES_SETTINGS.retention_days, 365),
    part_pictures_paused_until:
      typeof base.part_pictures_paused_until === "string" ? base.part_pictures_paused_until : null,
    part_pictures_pause_reason:
      typeof base.part_pictures_pause_reason === "string" ? base.part_pictures_pause_reason : null,
  };
}

export async function loadPartPicturesSettings(): Promise<PartPicturesSettings> {
  const raw = await kv.get(PART_PICTURES_SETTINGS_KEY);
  return mergePartPicturesSettings(
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PartPicturesSettingsKv) : {},
  );
}

export async function savePartPicturesSettings(patch: Partial<PartPicturesSettingsKv>): Promise<void> {
  const current = await loadPartPicturesSettings();
  await kv.set(PART_PICTURES_SETTINGS_KEY, { ...current, ...patch });
}

/** True while a pause is in force (budget wait, key refusal). Mirrors isPicturesPaused. */
export function isPartPicturesPaused(settings: PartPicturesSettingsKv, now: Date): boolean {
  const until = settings.part_pictures_paused_until;
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

/** Jamaica calendar day as YYYY-MM-DD (Jamaica has no daylight saving). Used for the daily max. */
export function partPictureDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
