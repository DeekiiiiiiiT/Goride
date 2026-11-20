/**
 * Slice C — place filter + fitLabel (LC-07).
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/parts_finder_places.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  carSizesFrom,
  fitLabelForPart,
  isCarMakerSource,
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
  // owner 20 Nov: parts matched on the car size spec say Fits by size
  assertEquals(fitLabelForPart({ status: "verified", tier: 5 }), "fits_by_size");
  assertEquals(fitLabelForPart({ status: "verified", tier: 3 }), "also_fits");
  assertEquals(fitLabelForPart({ status: "verified", tier: 2 }), "also_fits");
});
Deno.test("car size: the car maker's size goes above the parts, with the battery type and the source", () => {
  const universal = [
    { specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, items: [{ id: "p1" }] },
    { specKey: "battery_type", label: "Battery type", value: "EFB", unit: null, items: [] },
  ];
  const specs = [
    { spec_key: "battery_jis", value: "M-42", evidence_url: "https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/x" },
    { spec_key: "battery_type", value: "EFB", evidence_url: null },
  ];
  assertEquals(carSizesFrom(universal, specs), [
    { specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, type: "EFB", fromCarMaker: true },
  ]);
  // a parts maker's fitment list is a fine source, but it is not the car maker
  assertEquals(carSizesFrom(universal, [{ spec_key: "battery_jis", evidence_url: "https://gyb.gs-yuasa.com/x" }])[0].fromCarMaker, false);
  assertEquals(carSizesFrom([{ specKey: "tyre_size", value: "" }], []), []);
  assertEquals(carSizesFrom(null, []), []);
  assertEquals(isCarMakerSource("https://www.toyota.jp/roomy"), true);
  assertEquals(isCarMakerSource("https://megazip.net/zapchasti-dlya-avtomobiley/x"), true);
  assertEquals(isCarMakerSource("https://notamayama.com.evil.io/"), false);
  assertEquals(isCarMakerSource("not a url"), false);
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
