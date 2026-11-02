/**
 * deno test --allow-read supabase/functions/_fleet-server/parts_import_csv.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { parsePartsImportCsv } from "./parts_import_csv.ts";
import { parseImportVehicleLabel, isCatalogVariantUuid } from "../../../packages/types/src/partsDatabaseImportCsv.ts";

Deno.test("parses header and rejects price column", () => {
  const csv = "vehicle,part_type,brand,part_number,match_type,year_from,year_to,source_url,price\nx,y,z,1,oem,2020,2020,https://a.com,9";
  const parsed = parsePartsImportCsv(csv);
  assertEquals(parsed.headerErrors.some((e) => e.code === "SCHEMA_INVALID"), true);
});

Deno.test("handles quoted newline inside field", () => {
  const csv =
    "vehicle,part_type,brand,part_number,match_type,year_from,year_to,source_url\n" +
    '"Toyota\nRoomy M900A 2019",BRK-PADS,Toyota,123,oem,2020,2020,https://x.com';
  const parsed = parsePartsImportCsv(csv);
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0]!.raw.vehicle.includes("\n"), true);
});

Deno.test("strips UTF-8 BOM", () => {
  const csv = "\uFEFFvehicle,part_type,brand,part_number,match_type,year_from,year_to,source_url\na,b,c,1,oem,2020,2020,https://x.com";
  const parsed = parsePartsImportCsv(csv);
  assertEquals(parsed.rows.length, 1);
});

Deno.test("vehicle label parser supports multi-word model and chassis", () => {
  const p = parseImportVehicleLabel("Toyota Land Cruiser J200 2015");
  assertEquals(p?.make, "Toyota");
  assertEquals(p?.model, "Land Cruiser");
  assertEquals(p?.chassis, "J200");
  assertEquals(p?.year, "2015");
});

Deno.test("UUID helper rejects non-uuid 36-char strings", () => {
  assertEquals(isCatalogVariantUuid("00000000-0000-0000-0000-000000000000"), false);
  assertEquals(isCatalogVariantUuid("550e8400-e29b-41d4-a716-446655440000"), true);
});

Deno.test("parses semicolon-separated file", () => {
  const csv = "vehicle;part_type;brand;part_number;match_type;year_from;year_to;source_url\na;b;c;1;oem;2020;2020;https://x.com";
  const parsed = parsePartsImportCsv(csv);
  assertEquals(parsed.rows.length, 1);
});

Deno.test("fixture brakes-ok.csv parses rows", async () => {
  const text = await Deno.readTextFile("supabase/tests/fixtures/parts-import/brakes-ok.csv");
  const parsed = parsePartsImportCsv(text);
  assertEquals(parsed.headerErrors.length, 0);
  assertEquals(parsed.rows.length >= 1, true);
});
