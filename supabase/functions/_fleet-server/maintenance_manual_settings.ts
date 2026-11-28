/**
 * Maintenance manual reader settings — `kv_store_37f42386.key = 'maintenance_manual:settings'`.
 *
 * Same small kv_store pattern as `part_pictures_settings.ts` (which lives next to this file): one object, a
 * default for every missing field, and the worker reading it fresh on every run. Nothing here is compiled
 * into the code, so which reader reads the pages can be changed without a deploy.
 *
 * `manual_reader` is one of the two page readers:
 *   - "deepseek" — DeepSeek (docs/maintenance-enterprise-rebuild-review.md B4). The default.
 *   - "gemini"   — Gemini, the original reader, and the backup a failed DeepSeek page falls back to.
 */
import * as kv from "./kv_store.tsx";

export const MANUAL_SETTINGS_KEY = "maintenance_manual:settings";

export type ManualReaderName = "deepseek" | "gemini";

export type ManualSettingsKv = {
  /** Which reader reads the pages. Default "deepseek"; anything else falls back to the default. */
  manual_reader?: string | null;
};

export type ManualSettings = {
  manual_reader: ManualReaderName;
};

export const DEFAULT_MANUAL_SETTINGS: ManualSettings = {
  manual_reader: "deepseek",
};

function readerName(raw: unknown): ManualReaderName {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return text === "gemini" || text === "deepseek" ? text : DEFAULT_MANUAL_SETTINGS.manual_reader;
}

/** Merge a stored object over the defaults. A missing, blank or unknown reader is the default, never an error. */
export function mergeManualSettings(raw: ManualSettingsKv | null | undefined): ManualSettings {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { manual_reader: readerName(base.manual_reader) };
}

/**
 * Read the setting for one worker run. A kv hiccup must not stop the reader: it answers the default and the
 * page still gets read (with the default reader), instead of the whole run failing.
 */
export async function loadManualSettings(): Promise<ManualSettings> {
  try {
    const raw = await kv.get(MANUAL_SETTINGS_KEY);
    return mergeManualSettings(
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ManualSettingsKv) : {},
    );
  } catch (err) {
    console.warn("[maintenance-manual-settings] settings unreadable, using the default reader", err);
    return { ...DEFAULT_MANUAL_SETTINGS };
  }
}

/** Save a patch over the stored settings (used by a settings route or the owner's SQL; never by the worker). */
export async function saveManualSettings(patch: Partial<ManualSettingsKv>): Promise<ManualSettings> {
  const current = await loadManualSettings();
  const next = mergeManualSettings({ ...current, ...patch });
  await kv.set(MANUAL_SETTINGS_KEY, next);
  return next;
}
