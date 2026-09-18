/**
 * Deno unit tests for driver activity logic (I1–I8 core).
 * Run: deno test supabase/functions/_fleet-server/driver_activity_logic.test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCoverageWindows,
  computeEventAcceptanceRate,
  deriveStatusSegments,
  mapRidesAuditToCanonical,
} from "./driver_activity_logic.ts";

Deno.test("vocabulary: offer_accepted and ride_completed map", () => {
  assertEquals(mapRidesAuditToCanonical("offer_accepted"), "offer_accepted");
  assertEquals(mapRidesAuditToCanonical("ride_completed"), "job_completed");
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
