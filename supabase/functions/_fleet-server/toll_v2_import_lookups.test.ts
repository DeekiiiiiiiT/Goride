import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildIndriveDriverMapFromRecords,
  buildVehicleByPlate,
  vehiclePlatesForLookup,
} from "./toll_v2_import_lookups.ts";

Deno.test("buildVehicleByPlate: a car's own plate beats another car's alias, whatever the row order", () => {
  const a = { id: "car-a", license_plate: "5179KZ" };
  const b = { id: "car-b", license_plate: "9042PX", plate_aliases: ["5179KZ", "1111AA"] };
  for (const rows of [[a, b], [b, a]]) {
    const map = buildVehicleByPlate(rows);
    assertEquals(map["5179KZ"], "car-a");
    assertEquals(map["9042PX"], "car-b");
    assertEquals(map["1111AA"], "car-b");
  }
});

Deno.test("buildVehicleByPlate: an alias two cars claim matches neither", () => {
  const map = buildVehicleByPlate([
    { id: "car-a", license_plate: "1000AA", plate_aliases: ["7777ZZ"] },
    { id: "car-b", license_plate: "2000BB", plate_aliases: ["7777ZZ"] },
  ]);
  assertEquals(map["7777ZZ"], undefined);
  assertEquals(map["1000AA"], "car-a");
});

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
