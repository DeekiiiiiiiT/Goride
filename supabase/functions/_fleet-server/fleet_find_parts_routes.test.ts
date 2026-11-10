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
  myVehicleCard,
  myVehicleVerifiedFromKv,
  photoFolderAllowed,
  vehicleContextSpecsForResponse,
  quoteInputError,
  replyDueAt,
  scopedToOrg,
  sourcingRow,
  vehicleContextStatus,
  wearPercent,
} from "./fleet_find_parts_routes.ts";
import {
  formatAlternateTrimsLine,
  formatEngineFilterLine,
  formatTrimStepLabel,
  hubLabelFromVehicle,
} from "./vehicle_parts_context.ts";

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

Deno.test("T6 quantity of zero is refused, and within_24h is an urgency", () => {
  assertEquals(quoteInputError({ qty: 0 }), "Quantity must be at least 1");
  assertEquals(quoteInputError({ qty: -1 }), "Quantity must be at least 1");
  assertEquals(quoteInputError({ urgency: "24h" })?.includes("within_24h"), true);
  assertEquals(quoteInputError({ qty: 2, urgency: "within_24h", note: "front pads" }), null);
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
    gte(column: string, value: string) {
      seen.push(`${column}>=${value}`);
      return chain;
    },
    in(column: string, value: unknown) {
      seen.push(`${column} in ${JSON.stringify(value)}`);
      return chain;
    },
    lt(column: string, value: string) {
      seen.push(`${column}<${value}`);
      return chain;
    },
    not(_column: string, _op: string, _value: unknown) {
      return chain;
    },
    order() { return chain; },
    limit() { return Promise.resolve({ data: [], error: null, count: 0 }); },
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
    },
  };
  const supabase = {
    from(table: string) {
      seen.push(`from:${table}`);
      return chain;
    },
  };
  await loadPartsActivity(supabase as never, "org-mine");
  assertEquals(seen.filter((row) => row === "from:parts_sourcing_requests").length > 0, true);
  assertEquals(seen.filter((row) => row === "from:part_repeat_alert").length, 1);
  assertEquals(seen.includes("organization_id=org-mine"), true);
  assertEquals(seen.includes("organization_id=org-other"), false);
});

Deno.test("saved searches and parts lists stay on the caller org", () => {
  const rows = [
    { organization_id: "org-mine", name: "pads" },
    { organization_id: "org-other", name: "secret" },
  ];
  const kept = scopedToOrg(rows, "org-mine");
  assertEquals(kept.length, 1);
  assertEquals(kept[0].name, "pads");
});

Deno.test("within_24h reply is due in 24 hours", () => {
  const from = Date.parse("2026-10-31T12:00:00.000Z");
  assertEquals(replyDueAt("within_24h", from), "2026-11-01T12:00:00.000Z");
  assertEquals(replyDueAt("urgent", from), "2026-10-31T20:00:00.000Z");
});

Deno.test("my vehicle card keeps an empty shelf visible", () => {
  const card = myVehicleCard({ make: "Honda", model: "Fit", year: 2018, verified: true });
  assertEquals(card.shelfCount, 0);
  assertEquals(card.serviceDue, "None yet");
  assertEquals(card.verified, true);
});

const MY_VEHICLES_CATALOG = "e2000005-0000-4000-8000-000000000010";
const STALE_CATALOG = "e2000005-0000-4000-8000-000000000099";

Deno.test("T9 my-vehicles verified uses explicit link that exists in catalog, not stale catalogId", () => {
  const verifiedSet = new Set([MY_VEHICLES_CATALOG]);
  assertEquals(
    myVehicleVerifiedFromKv(
      { catalogId: STALE_CATALOG, make: "Toyota", model: "Roomy" },
      verifiedSet,
    ),
    false,
  );
  assertEquals(
    myVehicleVerifiedFromKv(
      { vehicle_catalog_id: MY_VEHICLES_CATALOG, catalogId: STALE_CATALOG, make: "Toyota" },
      verifiedSet,
    ),
    true,
  );
});

Deno.test("T10 vehicle-context specs are all null when unverified", () => {
  const extras = {
    trim_series: "Pre-Facelift",
    engine_code: "1KR-FE",
    engine_displacement_l: 1,
    drivetrain: "2WD",
    chassis_code: "M900A",
    engineFilterLine: "1KR-FE",
    alternateTrimsLine: "also …",
    brake_front_type: "disc",
    brake_rear_type: "drum",
    brake_front_rotor_mm: 256,
    brake_rear_drum_mm: 200,
    hub_bolt_pattern: "4x100",
    abs_channels: "4",
    handbrake_type: "cable",
  };
  const unverified = vehicleContextSpecsForResponse(false, extras);
  assertEquals(Object.values(unverified).every((v) => v === null), true);
  const verified = vehicleContextSpecsForResponse(true, extras);
  assertEquals(verified.engine_code, "1KR-FE");
  assertEquals(verified.chassis_code, "M900A");
});

Deno.test("brake wear is blank until a service interval exists", () => {
  assertEquals(wearPercent(null, 40000), null);
  assertEquals(wearPercent(10000, 40000), 75);
});

Deno.test("photo upload refuses another org folder", () => {
  assertEquals(photoFolderAllowed("org-mine", "org-other/secret"), false);
  assertEquals(photoFolderAllowed("org-mine", "org-mine/photo.jpg"), true);
  assertEquals(photoFolderAllowed("org-mine", ""), true);
});

Deno.test("trim step label uses series engine and drivetrain", () => {
  assertEquals(
    formatTrimStepLabel({ trim_series: "Pre-Facelift", engine_code: "1KR-FE", drivetrain: "2WD" }),
    "Pre-Facelift · 1KR-FE · 2WD",
  );
});

Deno.test("engine filter line includes displacement", () => {
  assertEquals(formatEngineFilterLine({ engine_code: "1NZ-FXE", engine_displacement_l: 1.5 }), "1NZ-FXE 1.5L");
});

Deno.test("alternate trims line joins siblings", () => {
  const line = formatAlternateTrimsLine("a", [
    { id: "a", engine_code: "1NZ-FE", engine_displacement_l: 1.5, chassis_code: "NSP160" },
    { id: "b", engine_code: "1NR-FE", engine_displacement_l: 1.3, chassis_code: "NSP160" },
    { id: "c", engine_code: "1NZ-FXE", engine_displacement_l: 1.5, chassis_code: "NHP160" },
  ]);
  assertEquals(line.includes("1NR-FE"), true);
  assertEquals(line.includes("and"), true);
});

Deno.test("vehicle context trim label for Roomy-style catalog row", () => {
  assertEquals(
    formatTrimStepLabel({
      trim_series: "Pre-Facelift",
      engine_code: "1KR-FE",
      drivetrain: "2WD",
    }),
    "Pre-Facelift · 1KR-FE · 2WD",
  );
});

Deno.test("hub label prefers vehicle depot then org name", () => {
  assertEquals(hubLabelFromVehicle({ depot: "Kingston" }, "Roam Fleet"), "Kingston");
  assertEquals(hubLabelFromVehicle({}, "Kingston Auto"), "Kingston Auto");
  assertEquals(hubLabelFromVehicle({}, null), "Fleet hub");
});

import {
  findPartsCatalogVariant,
  partInterchangeFitsCatalogIds,
  rejectUnlessVehicleId,
  requireVariantInVerifiedSet,
} from "./fleet_parts_access.ts";
import { registerFleetFindPartsRoutes } from "./fleet_find_parts_routes.ts";

const TEST_CATALOG = "e2000005-0000-4000-8000-000000000010";
const FOREIGN_CATALOG = "e2000005-0000-4000-8000-000000000020";
const PARTS_VEHICLE_OPTIONS = "/make-server-37f42386/parts/vehicle-options";

Deno.test("route rule: /find without vehicleId is 400", () => {
  assertEquals(rejectUnlessVehicleId("")?.status, 400);
});

Deno.test("route rule: /find ignores foreign variantId", () => {
  assertEquals(findPartsCatalogVariant(TEST_CATALOG, FOREIGN_CATALOG), TEST_CATALOG);
});

Deno.test("route rule: /term without vehicleId is 400", () => {
  assertEquals(rejectUnlessVehicleId("")?.error?.includes("cars"), true);
});

Deno.test("route rule: /browse without variantId is 400", () => {
  assertEquals(requireVariantInVerifiedSet("", [TEST_CATALOG]).status, 400);
});

Deno.test("route rule: /lookup part not listed for org cars returns 404", () => {
  const group = "a1111111-1111-4111-8111-111111111111";
  assertEquals(partInterchangeFitsCatalogIds(group, new Map([[group, new Set([FOREIGN_CATALOG])]]), [TEST_CATALOG]), false);
});

Deno.test("route rule: /vehicle-options route is not registered", () => {
  const paths: string[] = [];
  const app = {
    get(path: string, ..._handlers: unknown[]) { paths.push(path); },
    post(path: string, ..._handlers: unknown[]) { paths.push(path); },
    put() {},
  };
  registerFleetFindPartsRoutes(app, {} as never);
  assertEquals(paths.includes(PARTS_VEHICLE_OPTIONS), false);
});

Deno.test("route rule: /catalog-request without vehicleId is 400", () => {
  assertEquals(rejectUnlessVehicleId("   ")?.status, 400);
});

Deno.test("route rule: /request without vehicleId is 400", () => {
  assertEquals(rejectUnlessVehicleId("")?.status, 400);
});
