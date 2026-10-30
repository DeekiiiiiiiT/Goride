/**
 * Fleet Find parts route rules.
 * deno test --no-check supabase/functions/_fleet-server/fleet_find_parts_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import { requirePermission } from "./rbac_middleware.ts";
import { offersForFleet } from "./catalog_parts_shape.ts";
import {
  loadPartsActivity,
  photoFolderAllowed,
  quoteInputError,
  sourcingRow,
  vehicleContextStatus,
} from "./fleet_find_parts_routes.ts";

Deno.test("T2 unlinked vehicle is a 404-or-403 decision, not a search", () => {
  assertEquals(vehicleContextStatus(true, false), 403);
  assertEquals(vehicleContextStatus(false, false), 404);
  assertEquals(vehicleContextStatus(true, true), 200);
});

Deno.test("T4 another org's offer is dropped", () => {
  const offers = [
    { organization_id: "other", unit_price: 10 },
    { organization_id: "mine", unit_price: 12 },
    { organization_id: null, unit_price: 9 },
  ] as never;
  const kept = offersForFleet(offers, "mine").map((row) => row.unit_price);
  assertEquals(kept.includes(10), false);
  assertEquals(kept.includes(12), true);
});

Deno.test("T5 a driver cannot open find parts", async () => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("rbacUser", { userId: "driver-1", resolvedRole: "driver", organizationId: "org" });
    await next();
  });
  app.get("/parts/find", requirePermission("vehicles.view"), (c) => c.json({ ok: true }));
  const res = await app.request("/parts/find");
  assertEquals(res.status, 403);
});

Deno.test("T5 no user cannot open find parts", async () => {
  const app = new Hono();
  app.get("/parts/find", requirePermission("vehicles.view"), (c) => c.json({ ok: true }));
  const res = await app.request("/parts/find");
  assertEquals(res.status, 401);
});

Deno.test("T6 quantity of zero is refused, and 24h is not an urgency", () => {
  assertEquals(quoteInputError({ qty: 0 }), "Quantity must be at least 1");
  assertEquals(quoteInputError({ qty: -1 }), "Quantity must be at least 1");
  assertEquals(quoteInputError({ urgency: "24h" }), "Urgency must be low, normal, or urgent");
  assertEquals(quoteInputError({ qty: 2, urgency: "urgent", note: "front pads" }), null);
  assertEquals(quoteInputError({ note: "x".repeat(141) })?.includes("140"), true);
});

Deno.test("T7 another car is saved with no vehicle, and the component is kept", () => {
  const row = sourcingRow({
    orgId: "org-mine",
    vehicleId: null,
    needText: "Front brake pads · 2018 Honda Fit",
    componentId: "11111111-1111-4111-8111-111111111111",
    engineFamilyId: "22222222-2222-4222-8222-222222222222",
  });
  assertEquals(row.vehicle_id, null);
  assertEquals(row.maintenance_component_id, "11111111-1111-4111-8111-111111111111");
  assertEquals(row.engine_family_id, "22222222-2222-4222-8222-222222222222");
});

Deno.test("T8 activity quotes stay on the caller's org", async () => {
  const seen: string[] = [];
  const chain = {
    select() { return chain; },
    eq(column: string, value: string) {
      seen.push(`${column}=${value}`);
      return chain;
    },
    order() { return chain; },
    limit() { return Promise.resolve({ data: [], error: null, count: 0 }); },
  };
  const supabase = {
    from(table: string) {
      seen.push(`from:${table}`);
      return chain;
    },
  };
  await loadPartsActivity(supabase as never, "org-mine");
  assertEquals(seen.filter((row) => row === "from:part_quote_request").length, 1);
  assertEquals(seen.includes("organization_id=org-mine"), true);
  assertEquals(seen.includes("organization_id=org-other"), false);
});

Deno.test("photo upload refuses another org folder", () => {
  assertEquals(photoFolderAllowed("org-mine", "org-other/secret"), false);
  assertEquals(photoFolderAllowed("org-mine", "org-mine/photo.jpg"), true);
  assertEquals(photoFolderAllowed("org-mine", ""), true);
});
