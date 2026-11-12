/**
 * WRA-21: "Activity vs trips" for Week Reconciliation step 6. Read only, never blocks close.
 *
 * Source: the per-driver hours saved on the week's Uber upload (`payload_json.driverActivity`,
 * written by the Fleet importer from Uber's driver_activity.csv). Uploads made before that
 * field existed have nothing to show, so the step says "not recorded" for those weeks.
 */

export type ActivityDriver = {
  driverId: string;
  name: string;
  tripsCompleted: number;
  onlineHours: number;
  onTripHours: number;
  /** On-trip share of online time, 0–100 (null when online is 0). */
  onTripPct: number | null;
};

export type WeekActivity =
  | { status: "no_upload" }
  | { status: "not_recorded"; uploadedAt: string | null }
  | { status: "ok"; uploadedAt: string | null; drivers: ActivityDriver[] };

type BatchRow = { created_at?: string | null; payload_json?: Record<string, unknown> | null };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Newest completed Uber upload for the week first. */
export function shapeWeekActivity(batches: BatchRow[]): WeekActivity {
  const latest = batches[0];
  if (!latest) return { status: "no_upload" };
  const uploadedAt = latest.created_at ?? null;
  const raw = latest.payload_json?.driverActivity;
  if (!Array.isArray(raw)) return { status: "not_recorded", uploadedAt };
  const drivers = raw
    .map((r) => r as Record<string, unknown>)
    .filter((r) => String(r.driverId ?? "").trim())
    .map((r): ActivityDriver => {
      const online = num(r.onlineHours);
      const onTrip = num(r.onTripHours);
      return {
        driverId: String(r.driverId),
        name: String(r.name ?? r.driverId),
        tripsCompleted: Math.round(num(r.tripsCompleted)),
        onlineHours: online,
        onTripHours: onTrip,
        onTripPct: online > 0 ? Math.round((onTrip / online) * 100) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { status: "ok", uploadedAt, drivers };
}
