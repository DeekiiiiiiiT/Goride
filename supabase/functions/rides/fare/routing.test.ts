import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchGoogleDirectionsRoute } from "./routing.ts";

const KEY = "GOOGLE_MAPS_API_KEY_RIDES";

function withTestKey(fn: () => Promise<void>) {
  const prev = Deno.env.get(KEY);
  Deno.env.set(KEY, "test-key");
  return fn().finally(() => {
    if (prev == null) Deno.env.delete(KEY);
    else Deno.env.set(KEY, prev);
  });
}

Deno.test("fetchGoogleDirectionsRoute prefers duration_in_traffic and polyline", async () => {
  await withTestKey(async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          routes: [{
            overview_polyline: { points: "abc123poly" },
            legs: [{
              distance: { value: 5000 },
              duration: { value: 600 },
              duration_in_traffic: { value: 900 },
            }],
          }],
        }),
        { status: 200 },
      );

    const result = await fetchGoogleDirectionsRoute(18, -77, 18.01, -77.01, mockFetch);
    assertExists(result);
    assertEquals(result!.durationMinutes, 15);
    assertEquals(result!.trafficAware, true);
    assertEquals(result!.encodedPolyline, "abc123poly");
    assertEquals(result!.source, "google_directions");
  });
});

Deno.test("fetchGoogleDirectionsRoute uses baseline duration when no traffic", async () => {
  await withTestKey(async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          routes: [{
            legs: [{
              distance: { value: 2000 },
              duration: { value: 300 },
            }],
          }],
        }),
        { status: 200 },
      );

    const result = await fetchGoogleDirectionsRoute(18, -77, 18.01, -77.01, mockFetch);
    assertExists(result);
    assertEquals(result!.durationMinutes, 5);
    assertEquals(result!.trafficAware, false);
    assertEquals(result!.encodedPolyline, undefined);
  });
});

Deno.test("fetchGoogleDirectionsRoute returns null without API key", async () => {
  const prev = Deno.env.get(KEY);
  Deno.env.delete(KEY);
  Deno.env.delete("GOOGLE_MAPS_SERVER_KEY_RIDES");
  try {
    const result = await fetchGoogleDirectionsRoute(18, -77, 18.01, -77.01, async () => {
      throw new Error("should not fetch");
    });
    assertEquals(result, null);
  } finally {
    if (prev) Deno.env.set(KEY, prev);
  }
});
