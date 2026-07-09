import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyOrphanToll, OrphanCandidateTrip } from "./orphanTollClassifier.ts";

/**
 * Deno mirror test for the server orphan classifier. These fixtures intentionally
 * match apps/fleet/src/utils/orphanTollClassifier.test.ts (the client Vitest
 * suite) case-for-case, so any drift between the two hand-ported copies fails here.
 *
 * Run: deno test apps/fleet/src/supabase/functions/server/orphanTollClassifier.test.ts
 */

const PROXIMITY = 180;
const tripAt = (iso: string): OrphanCandidateTrip => ({ dropoffTime: iso });

Deno.test("no candidate trips → high / ORPHAN_NO_TRIP", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.confidence, "high");
  assertEquals(r.reasonCode, "ORPHAN_NO_TRIP");
  assertEquals(r.nearestTripDiffMinutes, null);
});

Deno.test("only trip is a different day → high / ORPHAN_NO_TRIP", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [tripAt("2026-03-09T12:00:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.confidence, "high");
  assertEquals(r.reasonCode, "ORPHAN_NO_TRIP");
  assertEquals(r.nearestTripDiffMinutes, 1440);
});

Deno.test("same-day trip outside proximity → medium / ORPHAN_OUT_OF_WINDOW", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [tripAt("2026-03-10T08:00:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.confidence, "medium");
  assertEquals(r.reasonCode, "ORPHAN_OUT_OF_WINDOW");
  assertEquals(r.nearestTripDiffMinutes, 240);
});

Deno.test("same-day trip within proximity → low / ORPHAN_NEARBY_UNEXPLAINED", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [tripAt("2026-03-10T11:00:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.confidence, "low");
  assertEquals(r.reasonCode, "ORPHAN_NEARBY_UNEXPLAINED");
  assertEquals(r.nearestTripDiffMinutes, 60);
});

Deno.test("exact proximity boundary → low / ORPHAN_NEARBY_UNEXPLAINED", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [tripAt("2026-03-10T09:00:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.reasonCode, "ORPHAN_NEARBY_UNEXPLAINED");
  assertEquals(r.nearestTripDiffMinutes, 180);
});

Deno.test("picks the nearest same-day trip", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [tripAt("2026-03-10T06:00:00Z"), tripAt("2026-03-10T11:30:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.reasonCode, "ORPHAN_NEARBY_UNEXPLAINED");
  assertEquals(r.nearestTripDiffMinutes, 30);
});

Deno.test("unparseable toll timestamp → low / ORPHAN_NEARBY_UNEXPLAINED", () => {
  const r = classifyOrphanToll({
    txDate: new Date("not-a-date"),
    candidateTrips: [tripAt("2026-03-10T08:00:00Z")],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.reasonCode, "ORPHAN_NEARBY_UNEXPLAINED");
  assertEquals(r.nearestTripDiffMinutes, null);
});

Deno.test("ignores unparseable trip anchors but uses valid ones", () => {
  const r = classifyOrphanToll({
    txDate: new Date("2026-03-10T12:00:00Z"),
    candidateTrips: [
      { dropoffTime: "garbage" },
      { requestTime: "2026-03-10T07:00:00Z" },
    ],
    orphanProximityMinutes: PROXIMITY,
  });
  assertEquals(r.isOrphan, true);
  assertEquals(r.confidence, "medium");
  assertEquals(r.reasonCode, "ORPHAN_OUT_OF_WINDOW");
  assertEquals(r.nearestTripDiffMinutes, 300);
});
