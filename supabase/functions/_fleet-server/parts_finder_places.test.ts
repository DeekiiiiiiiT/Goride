/**
 * Slice C — place filter + fitLabel (LC-07).
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/parts_finder_places.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fitLabelForPart,
  keepForPlaceCodes,
  keepForPosition,
  listingPlaceOf,
} from "./parts_finder.ts";

Deno.test("listingPlaceOf keeps catalyst codes and axis codes", () => {
  assertEquals(listingPlaceOf("before_cat"), "before_cat");
  assertEquals(listingPlaceOf("after_cat"), "after_cat");
  assertEquals(listingPlaceOf("front"), "front");
  assertEquals(listingPlaceOf(null), null);
});

Deno.test("keepForPlaceCodes before_cat keeps before_cat and blank", () => {
  const items = [
    { id: "before", listingPlace: "before_cat" },
    { id: "after", listingPlace: "after_cat" },
    { id: "blank", listingPlace: null },
  ];
  assertEquals(
    keepForPlaceCodes(items, ["before_cat"]).map((i) => i.id),
    ["before", "blank"],
  );
  assertEquals(
    keepForPlaceCodes(items, ["after_cat"]).map((i) => i.id),
    ["after", "blank"],
  );
  assertEquals(keepForPlaceCodes(items, ["unknown"]).map((i) => i.id), ["before", "after", "blank"]);
});

Deno.test("front/rear wheel filtering unchanged", () => {
  const items = [
    { position: "front", listingPlace: "front" },
    { position: null, listingPlace: null },
    { position: "rear", listingPlace: "rear" },
  ];
  assertEquals(keepForPosition(items, "front").map((i) => i.listingPlace), ["front", null]);
});

Deno.test("fitLabel cases", () => {
  assertEquals(fitLabelForPart({ status: "needs_checking", tier: 1 }), "check_before_buying");
  assertEquals(fitLabelForPart({ status: "verified", tier: 1 }), "made_for_car");
  assertEquals(fitLabelForPart({ status: "verified", tier: 2 }), "also_fits");
});
Deno.test("Log service places: wheel codes go to the wheel filter, never the place-code filter", async () => {
  const { splitPlacesForFind } = await import("./fleet_find_parts_routes.ts");
  const wheels = splitPlacesForFind(["LF", "RF"]);
  assertEquals(wheels.placeCodes, null);
  assertEquals(wheels.wheelPairs.length > 0, true);
  const o2 = splitPlacesForFind(["before_cat"]);
  assertEquals(o2.placeCodes, ["before_cat"]);
  assertEquals(o2.wheelPairs, []);
});
