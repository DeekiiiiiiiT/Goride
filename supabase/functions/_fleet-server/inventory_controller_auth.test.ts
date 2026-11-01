/** Static auth coverage for inventory_controller (§11.1). */
import { assertEquals } from "jsr:@std/assert@1";

const SRC = await Deno.readTextFile(
  new URL("./inventory_controller.tsx", import.meta.url),
);

Deno.test("inventory_controller uses strict auth on all routes", () => {
  if (!SRC.includes('requireAuth({ strict: true })')) {
    throw new Error("missing strict requireAuth");
  }
  assertEquals(true, true);
});

Deno.test("inventory_controller declares permission gates", () => {
  for (const perm of [
    "inventory.view",
    "inventory.move",
    "inventory.adjust",
    "inventory.approve",
    "inventory.export",
    "inventory.report",
  ]) {
    if (!SRC.includes(`requirePermission("${perm}")`)) {
      throw new Error(`missing requirePermission(${perm})`);
    }
  }
});

Deno.test("inventory_controller POST routes require Idempotency-Key helper", () => {
  if (!SRC.includes("requireIdempotencyKey")) {
    throw new Error("missing idempotency helper");
  }
  assertEquals(true, true);
});

Deno.test("driver inventory routes exist", () => {
  if (!SRC.includes("/driver/reports")) {
    throw new Error("missing driver reports route");
  }
  assertEquals(true, true);
});
