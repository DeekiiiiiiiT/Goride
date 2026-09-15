import { assertEquals } from "jsr:@std/assert";
import { unionFuelSealDriverIds } from "./fuel_week_seal_driver_union.ts";

Deno.test("H-7: snapshot-only driver id is included for seal", () => {
  const ids = unionFuelSealDriverIds([], {
    "73e5b1dc-01b4-45ee-a34a-25a3256b9841": { driverShare: 10, companyShare: 5 },
  });
  assertEquals(ids, ["73e5b1dc-01b4-45ee-a34a-25a3256b9841"]);
});

Deno.test("H-7: union DFP drivers and amountsByDriver keys", () => {
  const ids = unionFuelSealDriverIds(
    [{ driver_id: "d1" }, { driver_id: "d2" }],
    { d3: {} },
  );
  assertEquals(ids.sort(), ["d1", "d2", "d3"]);
});
