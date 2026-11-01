import { assertEquals } from "jsr:@std/assert@1";

Deno.test("R16 routes module exports registration", async () => {
  const mod = await import("./inventory_controller_r16.ts");
  assertEquals(typeof mod.registerInventoryR16Routes, "function");
  assertEquals(typeof mod.assertAlertSnoozeAllowed, "function");
});

Deno.test("inventory extended registers R16 routes", async () => {
  const src = await Deno.readTextFile(new URL("./inventory_controller_extended.ts", import.meta.url));
  if (!src.includes("registerInventoryR16Routes(app)")) {
    throw new Error("expected R16 route registration");
  }
  assertEquals(true, true);
});
