import { assertEquals } from "jsr:@std/assert@1";

const CTRL = await Deno.readTextFile(
  new URL("./inventory_controller.tsx", import.meta.url),
);
const PORTAL = await Deno.readTextFile(
  new URL("./inventory_driver_portal.ts", import.meta.url),
);

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
