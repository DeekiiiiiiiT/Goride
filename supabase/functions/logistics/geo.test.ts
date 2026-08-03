import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineKm, pointInGeoJson, type GeoJsonPolygon } from "./geo.ts";

const square: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [[
    [-77.5, 17.9],
    [-77.0, 17.9],
    [-77.0, 18.2],
    [-77.5, 18.2],
    [-77.5, 17.9],
  ]],
};

Deno.test("pointInGeoJson: inside Kingston-area square", () => {
  assertEquals(pointInGeoJson(-77.2, 18.0, square), true);
});

Deno.test("pointInGeoJson: outside square", () => {
  assertEquals(pointInGeoJson(-78.0, 18.0, square), false);
});

Deno.test("haversineKm: short distance is small", () => {
  const km = haversineKm({ lat: 18.0, lng: -77.0 }, { lat: 18.01, lng: -77.0 });
  assertEquals(km > 0 && km < 2, true);
});
