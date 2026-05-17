import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchDistanceMatrixDriveTimes, rankDriversByDriveTime } from "./distanceMatrix.ts";

const KEY = "GOOGLE_MAPS_API_KEY_RIDES";

function withTestKey(fn: () => Promise<void>) {
  const prev = Deno.env.get(KEY);
  Deno.env.set(KEY, "test-key");
  return fn().finally(() => {
    if (prev == null) Deno.env.delete(KEY);
    else Deno.env.set(KEY, prev);
  });
}

Deno.test("fetchDistanceMatrixDriveTimes maps durations by driver id", async () => {
  await withTestKey(async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          rows: [{
            elements: [
              { status: "OK", duration_in_traffic: { value: 120 } },
              { status: "OK", duration: { value: 600 } },
            ],
          }],
        }),
        { status: 200 },
      );

    const drivers = [
      { user_id: "a", lat: 18.01, lng: -77.01 },
      { user_id: "b", lat: 18.02, lng: -77.02 },
    ];
    const times = await fetchDistanceMatrixDriveTimes({ lat: 18, lng: -77 }, drivers, mockFetch);
    assertEquals(times?.get("a"), 120);
    assertEquals(times?.get("b"), 600);
  });
});

Deno.test("rankDriversByDriveTime sorts by drive time when matrix succeeds", async () => {
  await withTestKey(async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          rows: [{
            elements: [
              { status: "OK", duration_in_traffic: { value: 900 } },
              { status: "OK", duration_in_traffic: { value: 300 } },
            ],
          }],
        }),
        { status: 200 },
      );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const { ranked, source } = await rankDriversByDriveTime(
        { lat: 18, lng: -77 },
        [
          { user_id: "far", lat: 18.1, lng: -77.1, haversineKm: 1 },
          { user_id: "near", lat: 18.001, lng: -77.001, haversineKm: 2 },
        ],
      );
      assertEquals(source, "google_distance_matrix");
      assertEquals(ranked[0].user_id, "near");
      assertEquals(ranked[1].user_id, "far");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test("rankDriversByDriveTime falls back to haversine without API key", async () => {
  const prev = Deno.env.get(KEY);
  Deno.env.delete(KEY);
  Deno.env.delete("GOOGLE_MAPS_SERVER_KEY_RIDES");
  try {
    const { ranked, source } = await rankDriversByDriveTime(
      { lat: 18, lng: -77 },
      [
        { user_id: "b", lat: 18.02, lng: -77.02, haversineKm: 5 },
        { user_id: "a", lat: 18.01, lng: -77.01, haversineKm: 2 },
      ],
    );
    assertEquals(source, "haversine_fallback");
    assertEquals(ranked[0].user_id, "a");
    assertEquals(ranked[1].user_id, "b");
  } finally {
    if (prev) Deno.env.set(KEY, prev);
  }
});
