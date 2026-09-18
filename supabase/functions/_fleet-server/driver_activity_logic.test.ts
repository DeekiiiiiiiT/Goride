/**
 * Deno unit tests for driver activity logic (I1–I8 core + C4/C5/M1).
 * Run: deno test supabase/functions/_fleet-server/driver_activity_logic.test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCoverageBySource,
  buildCoverageWindows,
  computeEventAcceptanceRate,
  deriveStatusSegments,
  mapRidesAuditToCanonical,
  mergeIntervals,
  RIDES_AUDIT_MAPPED_TYPES,
  sumSegmentSeconds,
} from "./driver_activity_logic.ts";

Deno.test("vocabulary: mapped audit types never silently drop", () => {
  for (const t of RIDES_AUDIT_MAPPED_TYPES) {
    const payload =
      t === "driver_transition" || t === "cash_settlement_pending"
        ? { to: "on_trip" }
        : t.includes("force_complete")
        ? { action: "force_complete" }
        : t.includes("cancel")
        ? { cancelled_by: "driver" }
        : {};
    const mapped = mapRidesAuditToCanonical(t, payload);
    assertExists(mapped, `expected map for ${t}`);
  }
});

Deno.test("vocabulary: admin force maps to admin_action not job_completed", () => {
  assertEquals(mapRidesAuditToCanonical("admin_ride_force_complete"), "admin_action");
  assertEquals(mapRidesAuditToCanonical("admin_ride_force_cancel"), "admin_action");
  assertEquals(mapRidesAuditToCanonical("ride_completed"), "job_completed");
});

Deno.test("vocabulary: cancel party from cancelled_by", () => {
  assertEquals(
    mapRidesAuditToCanonical("ride_cancelled", { cancelled_by: "driver" }),
    "driver_cancelled",
  );
  assertEquals(mapRidesAuditToCanonical("ride_cancelled_rider"), "rider_cancelled");
  assertEquals(
    mapRidesAuditToCanonical("ride_auto_cancelled_matching_timeout"),
    "system_cancelled",
  );
});

Deno.test("I8 acceptance null when no offers", () => {
  assertEquals(
    computeEventAcceptanceRate({ accepted: 0, declined: 0, expired: 0 }),
    null,
  );
});

Deno.test("I7 uncovered window is not recorded", () => {
  const w = buildCoverageWindows(
    "2026-01-01T00:00:00.000Z",
    "2026-01-08T00:00:00.000Z",
    [],
  );
  assertEquals(w.length, 1);
  assertEquals(w[0].recorded, false);
});

Deno.test("C4 coverage is per-source — presence does not inherit trip coverage", () => {
  const by = buildCoverageBySource(
    "2026-01-01T00:00:00.000Z",
    "2026-09-20T00:00:00.000Z",
    [
      {
        service_line: "roam_rides",
        source: "rides.audit_events",
        covered_from: "2025-01-01T00:00:00.000Z",
        covered_to: null,
      },
      {
        service_line: "roam_rides",
        source: "fleet.driver_presence_log",
        covered_from: "2026-09-18T00:00:00.000Z",
        covered_to: null,
      },
    ],
  );
  const trip = by["roam_rides::rides.audit_events"];
  const presence = by["roam_rides::fleet.driver_presence_log"];
  assertEquals(trip.some((w) => w.recorded), true);
  // Early 2026 is recorded for trips but not for presence
  const earlyPresence = presence.find(
    (w) => !w.recorded || Date.parse(w.from) < Date.parse("2026-09-18T00:00:00.000Z"),
  );
  assertExists(earlyPresence);
});

Deno.test("I4 open online session has null to", () => {
  const segs = deriveStatusSegments(
    [{ event_type: "went_online", occurred_at: "2026-09-13T10:00:00.000Z" }],
    "2026-09-13T09:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
    "2026-09-13T12:00:00.000Z",
  );
  const open = segs.find((s) => s.kind === "online" && s.to == null);
  assertExists(open);
});

Deno.test("M1 overlapping on_job intervals union to 3600s", () => {
  const segs = deriveStatusSegments(
    [
      {
        event_type: "job_started",
        occurred_at: "2026-09-13T10:00:00.000Z",
        job_ref: "a",
      },
      {
        event_type: "job_completed",
        occurred_at: "2026-09-13T11:00:00.000Z",
        job_ref: "a",
      },
      {
        event_type: "job_started",
        occurred_at: "2026-09-13T10:30:00.000Z",
        job_ref: "b",
      },
      {
        event_type: "job_completed",
        occurred_at: "2026-09-13T11:30:00.000Z",
        job_ref: "b",
      },
    ],
    "2026-09-13T09:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
  );
  const onJob = sumSegmentSeconds(segs, "on_job");
  assertEquals(onJob, 5400); // 10:00–11:30 union = 1.5h
});

Deno.test("mergeIntervals collapses overlaps", () => {
  const merged = mergeIntervals([
    { start: 0, end: 3600_000 },
    { start: 1800_000, end: 7200_000 },
  ]);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].end - merged[0].start, 7200_000);
});

Deno.test("M1 two identical 1h on_job windows union to 3600s", () => {
  const segs = deriveStatusSegments(
    [
      {
        event_type: "job_started",
        occurred_at: "2026-09-13T10:00:00.000Z",
        job_ref: "a",
      },
      {
        event_type: "job_completed",
        occurred_at: "2026-09-13T11:00:00.000Z",
        job_ref: "a",
      },
      {
        event_type: "job_started",
        occurred_at: "2026-09-13T10:00:00.000Z",
        job_ref: "b",
      },
      {
        event_type: "job_completed",
        occurred_at: "2026-09-13T11:00:00.000Z",
        job_ref: "b",
      },
    ],
    "2026-09-13T09:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
  );
  assertEquals(sumSegmentSeconds(segs, "on_job"), 3600);
});

Deno.test("M7 historical still-online closes at window end with concrete seconds", () => {
  const segs = deriveStatusSegments(
    [{ event_type: "went_online", occurred_at: "2026-09-13T10:00:00.000Z" }],
    "2026-09-13T09:00:00.000Z",
    "2026-09-13T12:00:00.000Z",
    "2026-09-14T00:00:00.000Z", // now past window
  );
  const online = segs.find((s) => s.kind === "online");
  assertExists(online);
  assertEquals(online!.to, "2026-09-13T12:00:00.000Z");
  assertEquals(online!.seconds, 7200);
});

Deno.test("I6 page-boundary: segments sum exactly to window when fully covered", () => {
  const from = "2026-09-13T10:00:00.000Z";
  const to = "2026-09-13T14:00:00.000Z";
  const segs = deriveStatusSegments(
    [
      { event_type: "went_online", occurred_at: "2026-09-13T09:00:00.000Z" },
      { event_type: "went_offline", occurred_at: "2026-09-13T14:00:00.000Z" },
    ],
    from,
    to,
    "2026-09-13T15:00:00.000Z",
  );
  const total = segs.reduce((acc, s) => acc + (s.seconds ?? 0), 0);
  assertEquals(total, 4 * 3600);
});
