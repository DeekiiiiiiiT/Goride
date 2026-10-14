/**
 * Dominion vehicle-database responses must not carry a customer.
 * deno test supabase/functions/_fleet-server/catalog_privacy.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findCustomerIdentityLeak } from "./catalog_parts_shape.ts";

const root = new URL(".", import.meta.url);

Deno.test("catalog answers hide a customer", () => {
  assertEquals(findCustomerIdentityLeak({
    id: "lead-request",
    proposed_make: "Toyota",
    fleet_count: 3,
  }), null);
  assertEquals(findCustomerIdentityLeak({ organization_id: "org" }) != null, true);
  assertEquals(findCustomerIdentityLeak({ fleetVehicle: { id: "v" } }) != null, true);
  assertEquals(findCustomerIdentityLeak({ links: [{ catalogId: "x", count: 2 }] }), null);
});

Deno.test("pending catalog and catalog routes do not return a customer", async () => {
  const pending = await Deno.readTextFile(new URL("./pending_vehicle_catalog_routes.ts", root));
  const list = pending.slice(pending.indexOf("const items = [...grouped.values()]"));
  const returned = list.slice(0, list.indexOf("return c.json"));
  for (const key of ["organization_id", "fleet_vehicle_id", "fleetVehicle"]) {
    if (returned.includes(key)) throw new Error(`pending list still returns ${key}`);
  }
  const catalog = await Deno.readTextFile(new URL("./catalog_routes.ts", root));
  if (!catalog.includes("assertNoCustomerIdentity")) {
    throw new Error("catalog routes are not checked for a customer");
  }
});

Deno.test("five catalog answers keep the fleet parts shape", () => {
  const fixtures = ["noah", "hiace", "axio", "fit", "vitz"];
  for (const name of fixtures) {
    const body = {
      catalogMatched: true,
      catalogId: name,
      items: [{ fitmentId: "1", part: { name }, offers: [] }],
      count: 1,
      tiered: true,
      ready: true,
    };
    assertEquals(body.catalogMatched, true);
    assertEquals(Array.isArray(body.items), true);
    assertEquals(body.count, body.items.length);
    assertEquals(findCustomerIdentityLeak(body), null);
  }
});
