import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkFuelRoutingHealth,
  fetchGoogleDirectionsRouteWithTurn,
  fetchLegacyDirectionsKm,
} from "./directionsRoute.ts";

Deno.test("fetchGoogleDirectionsRouteWithTurn parses next turn and polyline", async () => {
  const previous = Deno.env.get("GOOGLE_MAPS_API_KEY_RIDES");
  Deno.env.set("GOOGLE_MAPS_API_KEY_RIDES", "test-browser-key");
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

  try {
  const route = await fetchGoogleDirectionsRouteWithTurn(18.01, -76.81, 18.02, -76.80, mockFetch);
  assertEquals(route?.source, "google_directions");
  assertEquals(route?.distanceKm, 2.5);
  assertEquals(route?.durationMinutes, 8);
  assertEquals(route?.encodedPolyline, "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assertEquals(route?.nextTurn?.instruction, "Turn left onto Hope Rd");
  assertEquals(route?.nextTurn?.distanceM, 120);
  } finally {
    if (previous == null) Deno.env.delete("GOOGLE_MAPS_API_KEY_RIDES");
    else Deno.env.set("GOOGLE_MAPS_API_KEY_RIDES", previous);
  }
});

const SERVER_KEY = "server-key-test";

function captureErrors(run: () => Promise<void>): Promise<string[]> {
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map((arg) => String(arg)).join(" "));
  };
  return run().finally(() => {
    console.error = orig;
  }).then(() => logged);
}

Deno.test("fuel routing reports a missing server key and does not call Google", async () => {
  let called = false;
  const logged = await captureErrors(async () => {
    const health = await checkFuelRoutingHealth({
      apiKey: null,
      fetchFn: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });
    assertEquals(health.ok, false);
    assertEquals(health.plainReason, "maps_key_missing");
    assertEquals(health.message.includes("server maps key"), true);
  });
  assertEquals(called, false);
  assertEquals(logged.some((line) => line.includes(SERVER_KEY)), false);
  assertEquals(logged.some((line) => line.includes("MAPS_KEY_MISSING")), true);
});

Deno.test("fuel routing logs a non-OK Google status without the key", async () => {
  const logged = await captureErrors(async () => {
    const result = await fetchLegacyDirectionsKm({
      apiKey: SERVER_KEY,
      fromLat: 17.97,
      fromLng: -76.79,
      toLat: 17.99,
      toLng: -76.95,
      fetchFn: async () =>
        new Response(JSON.stringify({
          status: "ZERO_RESULTS",
          error_message: `No route for ${SERVER_KEY}`,
        }), { status: 200 }),
    });
    assertEquals(result.km, null);
    assertEquals(result.failure?.plainReason, "no_road");
    assertEquals(result.failure?.legacyBlocked, false);
  });
  assertEquals(logged.some((line) => line.includes(SERVER_KEY)), false);
  assertEquals(logged.some((line) => line.includes("ZERO_RESULTS")), true);
  assertEquals(logged.some((line) => line.includes("[redacted]")), true);
});

Deno.test("fuel routing falls back to the Routes API when legacy Directions is blocked", async () => {
  const urls: string[] = [];
  const logged = await captureErrors(async () => {
    const health = await checkFuelRoutingHealth({
      apiKey: SERVER_KEY,
      fetchFn: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("routes.googleapis.com")) {
          return new Response(JSON.stringify({ routes: [{ distanceMeters: 22000 }] }), { status: 200 });
        }
        return new Response(JSON.stringify({
          status: "REQUEST_DENIED",
          error_message: "You're calling a legacy API, which is not enabled. Switch to the Routes API.",
        }), { status: 200 });
      },
    });
    assertEquals(health.ok, true);
    assertEquals(health.backend, "routes");
    assertEquals(health.message, "Road routes are working.");
  });
  assertEquals(urls.length, 2);
  assertEquals(urls[0].includes("maps.googleapis.com"), true);
  assertEquals(urls[1].includes("routes.googleapis.com"), true);
  assertEquals(logged.some((line) => line.includes(SERVER_KEY)), false);
  assertEquals(logged.some((line) => line.includes("REQUEST_DENIED")), true);
});
