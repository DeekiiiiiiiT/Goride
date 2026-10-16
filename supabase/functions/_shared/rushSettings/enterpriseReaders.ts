/**
 * Enterprise Rush settings readers — hours, holidays, busy mode, rollouts.
 * Pure helpers + getSetting-backed checks (America/Jamaica).
 */
import { getSetting, type GetSettingOptions } from "./getSetting.ts";

export const JAMAICA_TZ = "America/Jamaica";

export type DayHours = { open: string; close: string; closed: boolean };

export type PlatformServiceHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
  outsideHoursMessage: string;
};

export type HolidayEntry = {
  date: string;
  name: string;
  mode: "closed" | "reduced" | "normal";
  message?: string;
};

export type BusyMode = {
  active: boolean;
  extraEtaMinutes: number;
  pauseNewRestaurants: boolean;
  bannerMessage: string;
  autoEndAt: string | null;
};

export type Rollout = {
  mode: "off" | "beta_list" | "percent" | "on";
  percent: number;
  betaUserIds: string[];
};

export type QuietHours = { start: string; end: string };

export type PlatformOpenResult =
  | { ok: true }
  | { ok: false; code: "outside_hours" | "holiday_closed"; message: string };

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Calendar YYYY-MM-DD in America/Jamaica. */
export function jamaicaDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Minutes since midnight in America/Jamaica. */
export function jamaicaMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JAMAICA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Sunday = 0 … Saturday = 6 (Jamaica local). */
export function jamaicaWeekday(now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TZ,
    weekday: "short",
  }).format(now);
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const idx = short.indexOf(name.slice(0, 3));
  return idx < 0 ? 0 : idx;
}

export function clockToMinutes(value: string): number {
  const [hours, minutes] = String(value || "").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours)) return 0;
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/** True when Jamaica clock is inside open–close (supports overnight windows). */
export function isWithinDayHours(
  open: string,
  close: string,
  closed: boolean,
  now = new Date(),
): boolean {
  if (closed || !open || !close) return false;
  const current = jamaicaMinutes(now);
  const openM = clockToMinutes(open);
  const closeM = clockToMinutes(close);
  if (closeM > openM) return current >= openM && current < closeM;
  return current >= openM || current < closeM;
}

/** Quiet hours may wrap midnight (e.g. 21:00–08:00). */
export function isWithinQuietHours(quiet: QuietHours, now = new Date()): boolean {
  const start = clockToMinutes(quiet.start);
  const end = clockToMinutes(quiet.end);
  const current = jamaicaMinutes(now);
  if (end > start) return current >= start && current < end;
  return current >= start || current < end;
}

export function findHolidayForDate(
  holidays: HolidayEntry[],
  dateYmd: string,
): HolidayEntry | undefined {
  return holidays.find((h) => String(h.date) === dateYmd);
}

/** Pure check against hours + holiday calendar (no I/O). */
export function evaluatePlatformOpen(
  hours: PlatformServiceHours,
  holidays: HolidayEntry[],
  now = new Date(),
): PlatformOpenResult {
  const today = jamaicaDateString(now);
  const holiday = findHolidayForDate(holidays, today);
  if (holiday?.mode === "closed") {
    return {
      ok: false,
      code: "holiday_closed",
      message: holiday.message?.trim() ||
        `Roam Rush is closed today (${holiday.name}).`,
    };
  }

  const dayKey = WEEKDAY_KEYS[jamaicaWeekday(now)];
  const day = hours[dayKey];
  if (
    !day ||
    !isWithinDayHours(day.open, day.close, Boolean(day.closed), now)
  ) {
    return {
      ok: false,
      code: "outside_hours",
      message: hours.outsideHoursMessage ||
        "Roam Rush is closed right now. Please try again during service hours.",
    };
  }
  return { ok: true };
}

/** Auto-end: past autoEndAt → inactive regardless of `active` flag. */
export function resolveBusyModeValue(
  raw: BusyMode,
  now = new Date(),
): BusyMode {
  const extra = Math.max(0, Math.min(120, Number(raw.extraEtaMinutes) || 0));
  let active = Boolean(raw.active);
  if (active && raw.autoEndAt) {
    const end = Date.parse(String(raw.autoEndAt));
    if (Number.isFinite(end) && end <= now.getTime()) {
      active = false;
    }
  }
  return {
    active,
    extraEtaMinutes: active ? extra : 0,
    pauseNewRestaurants: active ? Boolean(raw.pauseNewRestaurants) : false,
    bannerMessage: String(raw.bannerMessage || ""),
    autoEndAt: raw.autoEndAt ?? null,
  };
}

export function applyBusyEtaMinutes(
  baseMins: number | null | undefined,
  busy: BusyMode,
): number | null {
  if (baseMins == null || !Number.isFinite(baseMins)) return baseMins ?? null;
  if (!busy.active || busy.extraEtaMinutes <= 0) return Math.round(baseMins);
  return Math.round(baseMins) + busy.extraEtaMinutes;
}

/** Deterministic 0–99 bucket from user id (percent rollouts). */
export function rolloutPercentBucket(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

export function evaluateRollout(
  rollout: Rollout,
  userId: string | null | undefined,
): boolean {
  switch (rollout.mode) {
    case "off":
      return false;
    case "on":
      return true;
    case "beta_list":
      if (!userId) return false;
      return (rollout.betaUserIds || []).includes(userId);
    case "percent": {
      if (!userId) return false;
      const pct = Math.max(0, Math.min(100, Number(rollout.percent) || 0));
      return rolloutPercentBucket(userId) < pct;
    }
    default:
      return false;
  }
}

export function substituteTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return String(body || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}

export type ReaderOpts = GetSettingOptions & { now?: Date };

/** Refuse orders outside platform hours / closed holidays. */
export async function assertPlatformOrderingOpen(
  opts: ReaderOpts = {},
): Promise<PlatformOpenResult> {
  const now = opts.now ?? new Date();
  const [hours, holidays] = await Promise.all([
    getSetting<PlatformServiceHours>("enterprise.hours.service", opts),
    getSetting<HolidayEntry[]>("enterprise.hours.holidays", opts),
  ]);
  return evaluatePlatformOpen(
    hours,
    Array.isArray(holidays) ? holidays : [],
    now,
  );
}

/** Busy mode with auto-end applied. */
export async function getResolvedBusyMode(
  opts: ReaderOpts = {},
): Promise<BusyMode> {
  const raw = await getSetting<BusyMode>("enterprise.busy_mode", opts);
  return resolveBusyModeValue(raw, opts.now ?? new Date());
}

/**
 * Gradual rollout helper.
 * app: customer | courier | partner
 */
export async function isRolloutEnabled(
  app: "customer" | "courier" | "partner",
  userId: string | null | undefined,
  marketId?: string | null,
  opts: ReaderOpts = {},
): Promise<boolean> {
  const key = `enterprise.rollouts.${app}` as const;
  const rollout = await getSetting<Rollout>(key, {
    ...opts,
    marketId: marketId ?? opts.marketId,
  });
  return evaluateRollout(rollout, userId);
}
