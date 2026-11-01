const DISPLAY_LOCALE = "en-GB";
const JAMAICA_TZ = "America/Jamaica";

function ymdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

export function formatMaintenanceDisplayDate(isoOrYmd: string | null | undefined): string {
  if (!isoOrYmd) return "—";
  const ymd = isoOrYmd.slice(0, 10);
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoOrYmd;
  return d.toLocaleDateString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatMaintenanceScheduledDate(isoOrYmd: string | null | undefined): string {
  if (!isoOrYmd) return "—";
  const ymd = isoOrYmd.slice(0, 10);
  const now = new Date();
  const today = ymdInTimeZone(now, JAMAICA_TZ);
  if (ymd === today) return "Today";
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrow = ymdInTimeZone(tomorrowDate, JAMAICA_TZ);
  if (ymd === tomorrow) return "Tomorrow";
  return formatMaintenanceDisplayDate(ymd);
}

export function formatRelativeAge(isoTimestamp: string | null | undefined): string | null {
  if (!isoTimestamp) return null;
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  return formatMaintenanceDisplayDate(isoTimestamp);
}

export function formatOdometerMetaSubline(
  recordedAt: string | null | undefined,
  sourceLabel: string | null | undefined,
): string {
  const age = formatRelativeAge(recordedAt);
  const src = sourceLabel?.trim() || "";
  if (age && src) return `${age} · ${src}`;
  if (age) return age;
  return src;
}

/** Nightly check strip copy (R-05b) in Jamaica local time. */
export function formatNightlyCheckRanLabel(startedAtIso: string | null | undefined): string {
  if (!startedAtIso) return "Nightly check status unknown";
  const started = new Date(startedAtIso);
  if (Number.isNaN(started.getTime())) return "Nightly check status unknown";

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(DISPLAY_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: JAMAICA_TZ,
    });

  const fmtDateInTz = (d: Date) => {
    const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone: JAMAICA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${day}`;
  };

  const runDay = fmtDateInTz(started);
  const nowDay = fmtDateInTz(new Date());
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDay = fmtDateInTz(yesterday);

  const hourUtc = started.getUTCHours();
  const minuteUtc = started.getUTCMinutes();
  const isScheduledCronWindow = hourUtc === 7 && minuteUtc < 15;

  if (runDay === nowDay && isScheduledCronWindow) {
    return "Nightly check ran 02:00 today";
  }
  if (runDay === nowDay) {
    return `Nightly check ran ${fmtTime(started)} today`;
  }
  if (runDay === yesterdayDay) {
    return `Nightly check ran ${fmtTime(started)} yesterday`;
  }
  return `Nightly check ran ${formatMaintenanceDisplayDate(runDay)} ${fmtTime(started)}`;
}
