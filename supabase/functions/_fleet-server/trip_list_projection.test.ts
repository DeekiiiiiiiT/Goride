/**
 * Run: deno test supabase/functions/_fleet-server/trip_list_projection.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { projectTripListValue } from "./trip_list_projection.ts";

Deno.test("F-20 keeps normalized Open/Enroute/Unavail distance for Overview km", () => {
  const projected = projectTripListValue({
    id: "t1",
    date: "2026-09-10",
    platform: "Uber",
    status: "Completed",
    distance: 12,
    pickupTime: "2026-09-10T12:00:00Z",
    dropoffTime: "2026-09-10T12:30:00Z",
    normalizedOpenDistance: 5.5,
    normalizedEnrouteDistance: 3.2,
    normalizedUnavailableDistance: 1.1,
    cancellationReason: "rider",
    // Heavy blobs must stay stripped
    polyline: "HEAVY",
    gpsTrace: [{ lat: 1, lng: 2 }],
    route: { points: [] },
  });

  assertEquals(projected.normalizedOpenDistance, 5.5);
  assertEquals(projected.normalizedEnrouteDistance, 3.2);
  assertEquals(projected.normalizedUnavailableDistance, 1.1);
  assertEquals(projected.pickupTime, "2026-09-10T12:00:00Z");
  assertEquals(projected.cancellationReason, "rider");
  assertEquals((projected as { polyline?: unknown }).polyline, undefined);
  assertEquals((projected as { gpsTrace?: unknown }).gpsTrace, undefined);
  assertEquals((projected as { route?: unknown }).route, undefined);
});
