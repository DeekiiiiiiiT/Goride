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
  photoFolderAllowed,
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
