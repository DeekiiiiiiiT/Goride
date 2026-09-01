/** Jamaica-local week boundaries for Rush live-sync synthetic batches. */
const JAMAICA_TZ = "America/Jamaica";

/** Monday yyyy-MM-dd in Jamaica local time for a given ISO instant. */
export function weekStartYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekdayIndex: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const local = new Date(`${y}-${m}-${day}T12:00:00`);
  const dow = weekdayIndex[weekday] ?? 0;
  local.setDate(local.getDate() - dow);
  return local.toISOString().slice(0, 10);
}

export function rushLiveSyncBatchId(orgId: string, eventIso: string): string {
  return `rush-live-sync:${orgId}:${weekStartYmdFromIso(eventIso)}`;
}

export const RUSH_PLATFORM = "Roam Rush";
