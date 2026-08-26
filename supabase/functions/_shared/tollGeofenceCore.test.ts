import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bearingMatchesPlazaDirection,
  evaluateLiveFixAgainstPlazas,
  isPointNearPlaza,
  replayPolylineCrossings,
  ROUND_TRIP_COOLDOWN_MS,
  routeCrossesPlaza,
  segmentIntersectsCircle,
  type TollPlazaGeo,
} from "./tollGeofenceCore.ts";

const PLAZA: TollPlazaGeo = {
  id: "p1",
  name: "Test Plaza",
  location: { lat: 18.0, lng: -76.8 },
  geofenceRadius: 200,
  defaultRateMinor: 36000,
  currency: "JMD",
  verificationStatus: "verified",
  direction: "Eastbound",
};

/** ~250 m west of plaza (outside 200 m circle). */
const WEST_OUT = { lat: 18.0, lng: -76.8023 };
/** ~250 m east of plaza (outside 200 m circle). */
const EAST_OUT = { lat: 18.0, lng: -76.7977 };
/** Point on plaza. */
const ON_PLAZA = { lat: 18.0, lng: -76.8 };

Deno.test("segmentIntersectsCircle detects highway skip between pings outside the circle", () => {
  // Both endpoints outside the 200 m geofence, but the chord passes through center.
  assertEquals(segmentIntersectsCircle(WEST_OUT, EAST_OUT, PLAZA.location, 200), true);
  // Point-in-circle on either endpoint alone would miss.
  assertEquals(isPointNearPlaza(WEST_OUT, PLAZA, 100, { requireVerified: true }), false);
  assertEquals(isPointNearPlaza(EAST_OUT, PLAZA, 100, { requireVerified: true }), false);
});

Deno.test("segmentIntersectsCircle rejects a parallel miss that never enters the circle", () => {
  // Segment ~500 m north of plaza, eastbound — never enters 200 m circle.
  const a = { lat: 18.0045, lng: -76.8023 };
  const b = { lat: 18.0045, lng: -76.7977 };
  assertEquals(segmentIntersectsCircle(a, b, PLAZA.location, 200), false);
});

Deno.test("routeCrossesPlaza uses segment intersection (not only point samples)", () => {
  assertEquals(routeCrossesPlaza([WEST_OUT, EAST_OUT], PLAZA, 100), true);
  // Single point outside → false
  assertEquals(routeCrossesPlaza([WEST_OUT], PLAZA, 100), false);
});

Deno.test("direction gating kills opposite-carriageway bearing", () => {
  // Eastbound plaza: westbound travel (east → west) should not match.
  const eastbound = { ...PLAZA, direction: "Eastbound" as const };
  assertEquals(
    routeCrossesPlaza([EAST_OUT, WEST_OUT], eastbound, 100),
    false,
  );
  // Eastbound travel (west → east) should match.
  assertEquals(
    routeCrossesPlaza([WEST_OUT, EAST_OUT], eastbound, 100),
    true,
  );
});

Deno.test("bearingMatchesPlazaDirection allows Both / Unknown", () => {
  assertEquals(bearingMatchesPlazaDirection(90, "Both"), true);
  assertEquals(bearingMatchesPlazaDirection(270, "Unknown"), true);
  assertEquals(bearingMatchesPlazaDirection(90, "Eastbound"), true);
  assertEquals(bearingMatchesPlazaDirection(270, "Eastbound"), false);
});

Deno.test("verified gating blocks unverified plazas from charging matches", () => {
  const unverified = { ...PLAZA, verificationStatus: "unverified" as const };
  assertEquals(routeCrossesPlaza([WEST_OUT, EAST_OUT], unverified, 100), false);
  assertEquals(
    routeCrossesPlaza([WEST_OUT, EAST_OUT], unverified, 100, { requireVerified: false }),
    true,
  );
  const missing = { ...PLAZA, verificationStatus: undefined };
  assertEquals(routeCrossesPlaza([ON_PLAZA], missing, 100), false);
});

Deno.test("cooldown config is honored in polyline replay (not hardcoded-only)", () => {
  const shortCooldown = 60_000; // 1 minute
  // Two eastbound passes separated by 2 minutes — should count twice with 1-min cooldown.
  const points = [
    WEST_OUT,
    EAST_OUT,
    { lat: 18.002, lng: -76.7977 }, // leave north
    WEST_OUT,
    EAST_OUT,
  ];
  const times = [0, 10_000, 60_000, 120_000, 130_000];
  const hits = replayPolylineCrossings(points, [PLAZA], {
    fallbackRadiusM: 100,
    cooldownMs: shortCooldown,
    pointTimesMs: times,
  });
  assertEquals(hits.length, 2);

  // Same polyline with default 5-min cooldown → only first crossing.
  const hitsDefault = replayPolylineCrossings(points, [PLAZA], {
    fallbackRadiusM: 100,
    cooldownMs: ROUND_TRIP_COOLDOWN_MS,
    pointTimesMs: times,
  });
  assertEquals(hitsDefault.length, 1);
});

Deno.test("polyline replay fixture: multi-plaza fleet route", () => {
  const plaza2: TollPlazaGeo = {
    id: "p2",
    name: "Second Plaza",
    location: { lat: 18.01, lng: -76.79 },
    geofenceRadius: 150,
    defaultRateMinor: 25000,
    currency: "JMD",
    verificationStatus: "verified",
    direction: "Both",
  };
  // Route that chords through p1 then later through p2.
  const nearP2A = { lat: 18.01, lng: -76.792 };
  const nearP2B = { lat: 18.01, lng: -76.788 };
  const route = [WEST_OUT, EAST_OUT, nearP2A, nearP2B];
  const hits = replayPolylineCrossings(route, [PLAZA, plaza2], {
    fallbackRadiusM: 100,
    cooldownMs: ROUND_TRIP_COOLDOWN_MS,
  });
  const ids = hits.map((h) => h.plazaId).sort();
  assertEquals(ids, ["p1", "p2"]);
});

Deno.test("evaluateLiveFixAgainstPlazas uses segment when prev is present", () => {
  const hits = evaluateLiveFixAgainstPlazas(WEST_OUT, EAST_OUT, [PLAZA], {
    fallbackRadiusM: 100,
    nowMs: 1_000_000,
  });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].plazaId, "p1");

  // Cooldown blocks immediate re-hit.
  const blocked = evaluateLiveFixAgainstPlazas(WEST_OUT, EAST_OUT, [PLAZA], {
    fallbackRadiusM: 100,
    nowMs: 1_000_000 + 30_000,
    recentByPlaza: new Map([["p1", 1_000_000]]),
    cooldownMs: ROUND_TRIP_COOLDOWN_MS,
  });
  assertEquals(blocked.length, 0);
});
