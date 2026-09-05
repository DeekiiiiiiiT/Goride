/**
 * Phase 5 — scheduled accountant export placeholder.
 * Wire to a cron / edge function that emails CSV of the prior week.
 */
export type ScheduledFuelExportConfig = {
  enabled: boolean;
  recipientEmail: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  includeCycles: boolean;
};

export const DEFAULT_SCHEDULED_FUEL_EXPORT: ScheduledFuelExportConfig = {
  enabled: false,
  recipientEmail: '',
  dayOfWeek: 1,
  includeCycles: true,
};

/** Returns the YYYY-MM-DD range for the most recently completed Mon–Sun week. */
export function priorCompletedWeekRange(today = new Date()): { start: string; end: string } {
  const d = new Date(today);
  const day = d.getDay(); // 0 Sun … 6 Sat
  // Most recent Sunday
  const end = new Date(d);
  end.setDate(d.getDate() - day);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: ymd(start), end: ymd(end) };
}
