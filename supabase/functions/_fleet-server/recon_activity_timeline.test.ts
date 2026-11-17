import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parseUberActivityTimelineText } from "./uber_activity_timeline_parse.ts";
import { shapeWeekTimeline, type TimelineEventRow } from "./recon_activity_timeline.ts";

const here = dirname(fromFileUrl(import.meta.url));
const DRIVER = "drv-kenny";

function ev(event_type: string, occurred_at: string, service_line = "uber"): TimelineEventRow {
  return { driver_id: DRIVER, service_line, source: "uber_app_activity", event_type, occurred_at };
}

/**
 * Real week of 26 Oct 2026 (Kenny, Uber copy as the owner gets it, ID columns removed).
 * Uber's own reports for the same week: trip file 60 completed (7/12/4/13/12/12);
 * vehicle_performance Hours Online 54.87, On Trip 32.60, On Job 45.11 (→ driving to pickup 12.51);
 * driver_time_and_distance Open 9:39 (9.65 h).
 */
Deno.test("26 Oct real week: trips per day and hours match Uber's own reports", async () => {
  const text = await Deno.readTextFile(join(here, "fixtures/uber-timeline-2026-10-26.txt"));
  const parsed = parseUberActivityTimelineText(text, { timeZone: "America/Jamaica", driverId: DRIVER });
  assertEquals(parsed.warnings, []);
  const events = parsed.events.map((e, i) => ({ ...ev(e.event_type, e.occurred_at), id: i }));
  const week = shapeWeekTimeline(events, [], "2026-10-26");
  assertEquals(week.status, "ok");
  if (week.status !== "ok") return;
  const k = week.drivers[0];
  assertEquals(k.days.map((d) => d.tripsCompleted), [7, 12, 4, 13, 12, 12, 0]);
  assertEquals(k.week.tripsCompleted, 60);
  assertEquals(k.week.driverCancels, 24);
  assertAlmostEquals(k.week.onlineHours, 54.87, 0.5);
  assertAlmostEquals(k.week.onTripHours, 32.6, 0.25);
  assertAlmostEquals(k.week.enrouteHours, 12.51, 0.5);
  assertAlmostEquals(k.week.waitingHours, 9.65, 0.5);
  for (const d of k.days) {
    assertAlmostEquals(d.onlineHours, d.waitingHours + d.enrouteHours + d.onTripHours, 0.02);
  }
});

Deno.test("stacked trip: offer accepted while on a trip goes straight to driving to pickup", () => {
  const week = shapeWeekTimeline([
    ev("went_online", "2026-10-27T13:00:00Z"),
    ev("offer_accepted", "2026-10-27T13:10:00Z"),
    ev("job_started", "2026-10-27T13:20:00Z"),
    ev("offer_accepted", "2026-10-27T13:40:00Z"), // queued
    ev("job_completed", "2026-10-27T14:00:00Z"),
    ev("job_started", "2026-10-27T14:15:00Z"),
    ev("job_completed", "2026-10-27T14:45:00Z"),
    ev("went_offline", "2026-10-27T15:00:00Z"),
  ], [], "2026-10-26");
  assert(week.status === "ok");
  const d = week.drivers[0].days.find((x) => x.day === "2026-10-27")!;
  assertEquals(d.waitingHours, Math.round((10 + 15) / 60 * 100) / 100); // 13:00-13:10 + 14:45-15:00
  assertEquals(d.enrouteHours, Math.round((10 + 15) / 60 * 100) / 100); // 13:10-13:20 + 14:00-14:15
  assertEquals(d.onTripHours, Math.round((40 + 30) / 60 * 100) / 100);
  assertEquals(d.onlineHours, 2);
  assertEquals(d.tripsCompleted, 2);
});

Deno.test("going offline mid-trip keeps the trip until it completes", () => {
  const week = shapeWeekTimeline([
    ev("went_online", "2026-10-27T13:00:00Z"),
    ev("offer_accepted", "2026-10-27T13:00:00Z"),
    ev("job_started", "2026-10-27T13:30:00Z"),
    ev("went_offline", "2026-10-27T13:45:00Z"),
    ev("job_completed", "2026-10-27T14:30:00Z"),
    ev("went_online", "2026-10-27T18:00:00Z"),
    ev("went_offline", "2026-10-27T18:30:00Z"),
  ], [], "2026-10-26");
  assert(week.status === "ok");
  const d = week.drivers[0].days.find((x) => x.day === "2026-10-27")!;
  assertEquals(d.onTripHours, 1);
  assertEquals(d.onlineHours, 2); // 1.5 h first stretch + 0.5 h later; nothing while offline
});

Deno.test("online across Jamaica midnight is split; a long overnight gap is not counted", () => {
  const short = shapeWeekTimeline([
    ev("went_online", "2026-10-28T04:00:00Z"), // 27 Oct 23:00 Jamaica
    ev("went_offline", "2026-10-28T06:00:00Z"), // 28 Oct 01:00 Jamaica
  ], [], "2026-10-26");
  assert(short.status === "ok");
  const days = short.drivers[0].days;
  assertEquals(days.find((d) => d.day === "2026-10-27")!.onlineHours, 1);
  assertEquals(days.find((d) => d.day === "2026-10-28")!.onlineHours, 1);

  const long = shapeWeekTimeline([
    ev("went_online", "2026-10-27T21:00:00Z"), // 16:00 Jamaica, no Offline logged
    ev("went_online", "2026-10-28T12:00:00Z"), // next morning
    ev("went_offline", "2026-10-28T13:00:00Z"),
  ], [], "2026-10-26");
  assert(long.status === "ok");
  const ld = long.drivers[0].days;
  assertEquals(ld.find((d) => d.day === "2026-10-27")!.onlineHours, 0);
  assertEquals(ld.find((d) => d.day === "2026-10-28")!.onlineHours, 1);
});

Deno.test("Uber trip-file count, Roam online hours, and no timeline in the week", () => {
  const week = shapeWeekTimeline([
    ev("went_online", "2026-10-27T13:00:00Z"),
    ev("went_offline", "2026-10-27T14:00:00Z"),
    ev("went_online", "2026-10-27T15:00:00Z", "roam_rides"),
    ev("went_offline", "2026-10-27T15:30:00Z", "roam_rides"),
  ], [
    { driver_id: DRIVER, date: "2026-10-27", platform: "Uber", status: "Completed" },
    { driver_id: DRIVER, date: "2026-10-27", platform: "Uber", status: "Cancelled" },
    { driver_id: DRIVER, date: "2026-10-27", platform: "InDrive", status: "Completed" },
    { driver_id: "someone-else", date: "2026-10-27", platform: "Uber", status: "Completed" },
  ], "2026-10-26", new Map([[DRIVER, "Kenny Gregory Rattray"]]));
  assert(week.status === "ok");
  const k = week.drivers[0];
  assertEquals(k.name, "Kenny Gregory Rattray");
  const d = k.days.find((x) => x.day === "2026-10-27")!;
  assertEquals(d.tripsInUberFile, 1);
  assertEquals(d.roamOnlineHours, 0.5);

  assertEquals(shapeWeekTimeline([ev("went_online", "2026-10-20T13:00:00Z")], [], "2026-10-26").status, "none");
});
