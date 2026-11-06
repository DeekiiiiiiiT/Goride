import { assertEquals } from "jsr:@std/assert@1";

const CTRL = await Deno.readTextFile(
  new URL("./inventory_controller.tsx", import.meta.url),
);
const PORTAL = await Deno.readTextFile(
  new URL("./inventory_driver_portal.ts", import.meta.url),
);

Deno.test("driver car-kit exposes fixedUnseenCount and reports seen route", () => {
  if (!PORTAL.includes("fixedUnseenCount")) {
    throw new Error("buildDriverCarKitPayload must return fixedUnseenCount");
  }
  if (!CTRL.includes("/driver/reports/seen")) {
    throw new Error("missing POST /driver/reports/seen");
  }
  if (!CTRL.includes("seen_by_driver_at: null")) {
    throw new Error("resolve must reset seen_by_driver_at");
  }
  assertEquals(true, true);
});

Deno.test("driver report POST accepts idempotency key", () => {
  const block = CTRL.slice(CTRL.indexOf("/driver/reports"), CTRL.indexOf("/driver/reports/:id"));
  if (!block.includes("requireIdempotencyKey")) {
    throw new Error("driver report POST must require Idempotency-Key");
  }
  assertEquals(true, true);
});

Deno.test("driver portal is wired (not stub-only)", () => {
  if (CTRL.includes("stub: true,\n    organizationId: org,\n    vehicleId:")) {
    throw new Error("driver car-kit route still returns stub payload");
  }
  if (!PORTAL.includes("buildDriverCarKitPayload")) {
    throw new Error("missing buildDriverCarKitPayload");
  }
  if (!PORTAL.includes("fleet_inv_driver_report")) {
    throw new Error("driver reports must use inv_driver_report bridge");
  }
  if (PORTAL.includes("fleet_inv_inv_driver_report")) {
    throw new Error("driver reports must not use doubled inv_ bridge name");
  }
});

Deno.test("driver report update handler exists", () => {
  if (!PORTAL.includes("handleDriverReportUpdatePost")) {
    throw new Error("missing handleDriverReportUpdatePost");
  }
  if (CTRL.includes('return c.json({ stub: true, reportId: c.req.param("id")')) {
    throw new Error("driver report updates route still stub");
  }
  assertEquals(true, true);
});

Deno.test("driver report update stores photo_paths on update row", () => {
  if (!PORTAL.includes("photo_paths: photoPaths")) {
    throw new Error("driver report update insert must set photo_paths");
  }
  if (!PORTAL.includes("Photo required for replacement updates")) {
    throw new Error("got_replacement must require photo");
  }
  assertEquals(true, true);
});

Deno.test("fleet report updates use by_role fleet without driver vehicle gate", () => {
  if (!PORTAL.includes('byRoleRaw === "fleet"') && !PORTAL.includes("by_role === \"fleet\"")) {
    throw new Error("fleet updates must accept by_role fleet");
  }
  if (!PORTAL.includes('by_role: byRole')) {
    throw new Error("update insert must set by_role from fleet/driver path");
  }
  assertEquals(true, true);
});
