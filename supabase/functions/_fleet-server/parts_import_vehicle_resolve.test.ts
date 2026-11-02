/**
 * deno test --allow-read supabase/functions/_fleet-server/parts_import_vehicle_resolve.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { parseImportVehicleLabel } from "../../../packages/types/src/partsDatabaseImportCsv.ts";

Deno.test("parseImportVehicleLabel: Roomy with chassis", () => {
  const p = parseImportVehicleLabel("Toyota Roomy M900A 2019");
  assertEquals(p?.make, "Toyota");
  assertEquals(p?.model, "Roomy");
  assertEquals(p?.chassis, "M900A");
});

Deno.test("parseImportVehicleLabel: returns null without year", () => {
  assertEquals(parseImportVehicleLabel("Toyota Roomy"), null);
});

Deno.test("parseImportVehicleLabel: Land Cruiser multi-word", () => {
  const p = parseImportVehicleLabel("Toyota Land Cruiser 2020");
  assertEquals(p?.model, "Land Cruiser");
});
