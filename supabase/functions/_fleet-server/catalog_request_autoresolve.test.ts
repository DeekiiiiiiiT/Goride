/**
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/catalog_request_autoresolve.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupsToResolve, typedTextNamesPart } from "./catalog_request_autoresolve.ts";

const BATTERY = "34615e73-cac1-4b77-b807-fb07e305ee6f";

Deno.test("typedTextNamesPart: the typed text holds the number (hyphens / spaces ignored, ≥4)", () => {
  assertEquals(typedTextNamesPart("Interstate PF-NS60L-5-INTL", "PF-NS60L-5-INTL"), true);
  assertEquals(typedTextNamesPart("interstate pfns60l5intl battery", "PF-NS60L-5-INTL"), true);
  assertEquals(typedTextNamesPart("Interstate NS60", "PF-NS60L-5-INTL"), false);
  assertEquals(typedTextNamesPart("anything 12", "12"), false);
});

Deno.test("groupsToResolve: service-log by number; car asks only when the part is listed for the car; same job only", async () => {
  const parts = [{ id: "pm-int", componentId: BATTERY, number: "PF-NS60L-5-INTL" }];
  const fits = new Set(["pm-int|car-fit"]);
  const out = await groupsToResolve(
    parts,
    [
      { groupKey: "g-log", componentId: BATTERY, origin: "service_log", needText: "Interstate PF-NS60L-5-INTL", vehicleCatalogId: "car-roomy" },
      { groupKey: "g-log-other", componentId: BATTERY, origin: "service_log", needText: "Bosch S4", vehicleCatalogId: "car-roomy" },
      { groupKey: "g-ask-fit", componentId: BATTERY, origin: "find_parts", needText: "battery", vehicleCatalogId: "car-fit" },
      { groupKey: "g-ask-nofit", componentId: BATTERY, origin: "find_parts", needText: "battery", vehicleCatalogId: "car-roomy" },
      { groupKey: "g-other-job", componentId: "other-job", origin: "service_log", needText: "Interstate PF-NS60L-5-INTL", vehicleCatalogId: null },
    ],
    (partId, carId) => Promise.resolve(fits.has(`${partId}|${carId}`)),
  );
  assertEquals(out, [
    { groupKey: "g-log", partId: "pm-int" },
    { groupKey: "g-ask-fit", partId: "pm-int" },
  ]);
});
