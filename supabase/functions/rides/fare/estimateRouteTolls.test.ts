import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decodeEncodedPolyline } from "../../_shared/polylineDecode.ts";
import { routeCrossesPlaza } from "../../_shared/tollGeofenceCore.ts";
import { estimateRouteTolls } from "./estimateRouteTolls.ts";
import { invalidateTollPlazaCache } from "./tollPlazaLoader.ts";

function mockDb(plazaRows: Array<{ key: string; value: unknown }>) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        like: async (_col: string, _pat: string) => ({ data: plazaRows, error: null }),
      }),
    }),
  } as unknown as import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
}

function plaza(id: string, lat: number, lng: number, radius: number, amountJmd: number) {
  return {
    key: `toll_plaza:${id}`,
    value: {
      name: id,
      location: { lat, lng },
      geofenceRadius: radius,
      rates: [{ vehicleClass: "Class 1", rate: amountJmd, currency: "JMD" }],
      status: "active",
    },
  };
}

Deno.test("decodeEncodedPolyline returns points", () => {
  // Known short polyline segment
  const pts = decodeEncodedPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assertEquals(pts.length > 0, true);
});

Deno.test("estimateRouteTolls counts plaza on route", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("portmore", 17.95, -76.87, 200, 360)]);
  // Polyline through Jamaica-ish coords (simplified)
  const encoded = "_ibE~|`bU???"; // will use direct point test instead

  const geo = {
    id: "portmore",
    name: "Portmore",
    location: { lat: 17.95, lng: -76.87 },
    geofenceRadius: 200,
    defaultRateMinor: 36000,
    currency: "JMD",
  };
  const routePoints = [{ lat: 17.9505, lng: -76.8705 }];
  assertEquals(routeCrossesPlaza(routePoints, geo, 100), true);

  // Full estimate with mock that has plaza at route point
  invalidateTollPlazaCache();
  const db2 = mockDb([plaza("t1", 17.9505, -76.8705, 500, 360)]);
  const poly = encodeSimplePolyline(routePoints);
  const est = await estimateRouteTolls(db2, poly, 100);
  assertEquals(est.plazas.length, 1);
  assertEquals(est.estimatedTollsMinor, 36000);
});

Deno.test("estimateRouteTolls returns zero when no plaza on route", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("far", 18.5, -77.5, 100, 360)]);
  const routePoints = [{ lat: 17.95, lng: -76.87 }];
  const poly = encodeSimplePolyline(routePoints);
  const est = await estimateRouteTolls(db, poly, 100);
  assertEquals(est.estimatedTollsMinor, 0);
  assertEquals(est.plazas.length, 0);
});

/** Minimal polyline encoder for tests (single-precision). */
function encodeSimplePolyline(points: Array<{ lat: number; lng: number }>): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = "";
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    result += encodeSigned(lat - lastLat);
    result += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

function encodeSigned(num: number): string {
  let s = num << 1;
  if (num < 0) s = ~s;
  let out = "";
  while (s >= 0x20) {
    out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  out += String.fromCharCode(s + 63);
  return out;
}
