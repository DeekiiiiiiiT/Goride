import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchGoogleDirectionsRouteWithTurn } from "../directionsRoute.ts";

Deno.test("fetchGoogleDirectionsRouteWithTurn parses next turn and polyline", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        routes: [{
          overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
          legs: [{
            distance: { value: 2500 },
            duration: { value: 420 },
            duration_in_traffic: { value: 480 },
            steps: [{
              html_instructions: "Turn <b>left</b> onto Hope Rd",
              distance: { value: 120 },
            }],
          }],
        }],
      }),
      { status: 200 },
    );

  const route = await fetchGoogleDirectionsRouteWithTurn(18.01, -76.81, 18.02, -76.80, mockFetch);
  assertEquals(route?.source, "google_directions");
  assertEquals(route?.distanceKm, 2.5);
  assertEquals(route?.durationMinutes, 8);
  assertEquals(route?.encodedPolyline, "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assertEquals(route?.nextTurn?.instruction, "Turn left onto Hope Rd");
  assertEquals(route?.nextTurn?.distanceM, 120);
});
