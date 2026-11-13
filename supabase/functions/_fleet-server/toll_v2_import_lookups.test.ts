import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildIndriveDriverMapFromRecords } from "./toll_v2_import_lookups.ts";

Deno.test("buildIndriveDriverMapFromRecords uses inDrive id and name, not Uber", () => {
  const map = buildIndriveDriverMapFromRecords([
    {
      id: "roam-1",
      inDriveDriverId: "ind-42",
      firstName: "John",
      lastName: "Doe",
      uberDriverId: "uber-uuid-should-not-appear",
    },
  ]);
  assertEquals(map["ind-42"], "roam-1");
  assertEquals(map["JOHN DOE"], "roam-1");
  assertEquals(map["uber-uuid-should-not-appear"], undefined);
});
