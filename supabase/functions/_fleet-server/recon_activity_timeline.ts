/**
 * Week Reconciliation step 6 — hours from the Uber app activity timeline
 * (fleet.driver_activity_events) and Uber trip-file counts. Read only; never affects pay.
 *
 * The timeline is walked event by event as one state per driver:
 *   offline → waiting (online, no job) → driving to pickup → on trip → …
 * Time between two events goes to the state the driver was in. So online = waiting +
 * driving to pickup + on trip, the same split Uber's own Time & Distance report uses.
 *
 * Rules:
 * - Uber can stack trips ("Accepted 2 trips"): an offer accepted while on a trip is queued;
 *   when that trip completes the driver goes straight to "driving to pickup".
 * - Going offline mid-trip keeps the trip running until it completes, then offline.
 * - A gap that crosses Jamaica midnight while not offline counts only when it is 4 hours
 *   or less; a longer gap is a missing "Offline" and ends at the earlier event (never invent time).
 * - Jamaica has no daylight saving (UTC−5 all year).
 */

import { weekDayKeys } from "../../../packages/finance-core/src/reconSources.ts";

const JAMAICA_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const MAX_OVERNIGHT_GAP_MS = 4 * 3_600_000;

export type TimelineEventRow = {
  id?: number | string | null;
  driver_id: string;
  service_line: string;
  source?: string | null;
  event_type: string;
  occurred_at: string;
};

export type TimelineTripRow = {
  driver_id: string | null;
  date: string | null;
  platform?: string | null;
  status?: string | null;
};

export type TimelineDayMetrics = {
  day: string;
  onlineHours: number;
  enrouteHours: number;
  onTripHours: number;
  waitingHours: number;
  tripsCompleted: number;
  tripsInUberFile: number;
  driverCancels: number;
  riderCancels: number;
  offersAccepted: number;
  roamOnlineHours: number;
};

export type TimelineDriver = {
  driverId: string;
  name: string;
  days: TimelineDayMetrics[];
  week: Omit<TimelineDayMetrics, "day">;
};

export type WeekTimeline =
  | { status: "none" }
  | { status: "ok"; drivers: TimelineDriver[] };

type State = "offline" | "waiting" | "enroute" | "on_trip";

function ms(iso: string): number {
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : NaN;
}

export function jamaicaYmd(instantMs: number): string {
  const local = new Date(instantMs - JAMAICA_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${
    String(local.getUTCDate()).padStart(2, "0")
  }`;
}

function dayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 5, 0, 0); // midnight Jamaica = 05:00 UTC
}

/** Add [from, to) to `bucket` per Jamaica day. */
function addSpan(bucket: Map<string, number>, from: number, to: number): void {
  let t = from;
  while (t < to) {
    const ymd = jamaicaYmd(t);
    const end = Math.min(to, dayStartMs(ymd) + DAY_MS);
    bucket.set(ymd, (bucket.get(ymd) ?? 0) + (end - t));
    t = end;
  }
}

function byTime(a: TimelineEventRow, b: TimelineEventRow): number {
  const d = ms(a.occurred_at) - ms(b.occurred_at);
  if (d !== 0) return d;
  return Number(a.id ?? 0) - Number(b.id ?? 0);
}

function spanCounts(prevMs: number, nextMs: number): boolean {
  if (!(nextMs > prevMs)) return false;
  if (jamaicaYmd(prevMs) === jamaicaYmd(nextMs)) return true;
  return nextMs - prevMs <= MAX_OVERNIGHT_GAP_MS;
}

type StateTotals = { waiting: Map<string, number>; enroute: Map<string, number>; on_trip: Map<string, number> };

/** Walk the Uber events of one driver (sorted) and sum time per state per day. */
export function walkUberStates(events: TimelineEventRow[]): StateTotals {
  const totals: StateTotals = { waiting: new Map(), enroute: new Map(), on_trip: new Map() };
  let state: State = "offline";
  let queued = 0;
  let offlineAfterTrip = false;
  let prevMs: number | null = null;

  for (const e of events) {
    const t = ms(e.occurred_at);
    if (!Number.isFinite(t)) continue;
    if (prevMs != null && state !== "offline" && spanCounts(prevMs, t)) {
      addSpan(totals[state], prevMs, t);
    }
    prevMs = t;

    switch (e.event_type) {
      case "went_online":
        offlineAfterTrip = false;
        if (state === "offline") state = "waiting";
        break;
      case "went_offline":
        if (state === "on_trip") offlineAfterTrip = true;
        else {
          state = "offline";
          queued = 0;
        }
        break;
      case "offer_accepted":
        if (state === "on_trip") queued++;
        else state = "enroute";
        break;
      case "arrived_pickup":
        if (state !== "on_trip") state = "enroute";
        break;
      case "job_started":
        if (state === "on_trip" && queued > 0) queued--; // the queued trip has started
        state = "on_trip";
        break;
      case "job_completed":
        if (queued > 0) {
          queued--;
          state = "enroute";
        } else if (offlineAfterTrip) {
          offlineAfterTrip = false;
          state = "offline";
        } else state = "waiting";
        break;
      case "driver_cancelled":
      case "rider_cancelled":
        if (state === "enroute") state = queued > 0 ? (queued--, "enroute") : "waiting";
        else if (state === "on_trip" && queued > 0) queued--;
        break;
      default:
        break;
    }
  }
  return totals;
}

/** Online seconds per day from on/off events only (used for Roam presence). */
function presenceTotals(events: TimelineEventRow[]): Map<string, number> {
  const out = new Map<string, number>();
  let onlineFrom: number | null = null;
  let prevMs: number | null = null;
  for (const e of events) {
    const t = ms(e.occurred_at);
    if (!Number.isFinite(t)) continue;
    if (e.event_type === "went_online") {
      if (onlineFrom == null) onlineFrom = t;
    } else if (e.event_type === "went_offline" && onlineFrom != null) {
      if (spanCounts(onlineFrom, t)) addSpan(out, onlineFrom, t);
      onlineFrom = null;
    }
    prevMs = t;
  }
  // Still online at the last event: count up to that event only.
  if (onlineFrom != null && prevMs != null && prevMs > onlineFrom) addSpan(out, onlineFrom, prevMs);
  return out;
}

function hours(msTotal: number | undefined): number {
  return Math.round(((msTotal ?? 0) / 3_600_000) * 100) / 100;
}

function isUberTimeline(e: TimelineEventRow): boolean {
  return e.service_line === "uber";
}

function isRoamPresence(e: TimelineEventRow): boolean {
  return (e.service_line === "roam_rides" || e.service_line === "roam_rush") &&
    (e.event_type === "went_online" || e.event_type === "went_offline");
}

function isCompletedUberTrip(t: TimelineTripRow): boolean {
  return String(t.platform ?? "").toLowerCase().includes("uber") &&
    String(t.status ?? "").toLowerCase() === "completed";
}

export function shapeWeekTimeline(
  events: TimelineEventRow[],
  trips: TimelineTripRow[],
  weekKey: string,
  driverNames: Map<string, string> = new Map(),
): WeekTimeline {
  const days = weekDayKeys(weekKey);
  const daySet = new Set(days);
  const uberEvents = events.filter(isUberTimeline);
  if (!uberEvents.some((e) => daySet.has(jamaicaYmd(ms(e.occurred_at))))) return { status: "none" };

  const driverIds = [...new Set(uberEvents.map((e) => String(e.driver_id)))];
  const drivers: TimelineDriver[] = [];

  for (const driverId of driverIds) {
    const mine = uberEvents.filter((e) => e.driver_id === driverId).sort(byTime);
    if (!mine.some((e) => daySet.has(jamaicaYmd(ms(e.occurred_at))))) continue;
    const states = walkUberStates(mine);
    const roam = presenceTotals(events.filter((e) => e.driver_id === driverId && isRoamPresence(e)).sort(byTime));

    const count = (type: string, ymd: string) =>
      mine.filter((e) => e.event_type === type && jamaicaYmd(ms(e.occurred_at)) === ymd).length;

    const dayRows: TimelineDayMetrics[] = days.map((ymd) => {
      const enroute = states.enroute.get(ymd) ?? 0;
      const onTrip = states.on_trip.get(ymd) ?? 0;
      const waiting = states.waiting.get(ymd) ?? 0;
      return {
        day: ymd,
        onlineHours: hours(waiting + enroute + onTrip),
        enrouteHours: hours(enroute),
        onTripHours: hours(onTrip),
        waitingHours: hours(waiting),
        tripsCompleted: count("job_completed", ymd),
        tripsInUberFile: trips.filter((t) =>
          t.driver_id === driverId && isCompletedUberTrip(t) && String(t.date ?? "").slice(0, 10) === ymd
        ).length,
        driverCancels: count("driver_cancelled", ymd),
        riderCancels: count("rider_cancelled", ymd),
        offersAccepted: count("offer_accepted", ymd),
        roamOnlineHours: hours(roam.get(ymd)),
      };
    });

    const sum = (k: keyof Omit<TimelineDayMetrics, "day">) =>
      Math.round(dayRows.reduce((a, r) => a + (r[k] as number), 0) * 100) / 100;
    drivers.push({
      driverId,
      name: driverNames.get(driverId) || driverId,
      days: dayRows,
      week: {
        onlineHours: sum("onlineHours"),
        enrouteHours: sum("enrouteHours"),
        onTripHours: sum("onTripHours"),
        waitingHours: sum("waitingHours"),
        tripsCompleted: sum("tripsCompleted"),
        tripsInUberFile: sum("tripsInUberFile"),
        driverCancels: sum("driverCancels"),
        riderCancels: sum("riderCancels"),
        offersAccepted: sum("offersAccepted"),
        roamOnlineHours: sum("roamOnlineHours"),
      },
    });
  }

  if (!drivers.length) return { status: "none" };
  return { status: "ok", drivers: drivers.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** S3: a timeline whose Uber ID differs from the driver's saved Uber ID is refused. */
export function uberTimelineDriverIdMismatch(
  savedUberDriverId: string | null | undefined,
  uberDriverUuid: string | null | undefined,
): boolean {
  const saved = String(savedUberDriverId || "").trim().toLowerCase();
  const body = String(uberDriverUuid || "").trim().toLowerCase();
  if (!body || !saved) return false;
  return saved !== body;
}
