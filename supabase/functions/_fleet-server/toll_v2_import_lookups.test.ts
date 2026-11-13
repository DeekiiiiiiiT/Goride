import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildIndriveDriverMapFromRecords,
  vehiclePlatesForLookup,
} from "./toll_v2_import_lookups.ts";

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

Deno.test("vehiclePlatesForLookup includes primary plate and plate_aliases", () => {
  assertEquals(
    vehiclePlatesForLookup({
      license_plate: "9042 PX",
      plate_aliases: ["5179KZ", "9042PX"],
    }),
    ["9042PX", "5179KZ"],
  );
});
