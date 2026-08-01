import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canTransitionPackage, PACKAGE_TRANSITIONS } from "./packageTransitions.ts";

Deno.test("package happy path miami to collected", () => {
  const path = [
    "expected",
    "received_miami",
    "manifested",
    "in_transit_intl",
    "customs_cleared",
    "received_hub",
    "ready_for_fulfillment",
    "awaiting_pickup",
    "collected",
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assertEquals(canTransitionPackage(path[i], path[i + 1]), true);
  }
});

Deno.test("package door delivery terminal", () => {
  assertEquals(canTransitionPackage("ready_for_fulfillment", "out_for_delivery"), true);
  assertEquals(canTransitionPackage("out_for_delivery", "delivered"), true);
  assertEquals(canTransitionPackage("delivered", "collected"), false);
});

Deno.test("customs hold recovers", () => {
  assertEquals(canTransitionPackage("in_transit_intl", "customs_hold"), true);
  assertEquals(canTransitionPackage("customs_hold", "customs_cleared"), true);
});

Deno.test("every status has transition map entry", () => {
  for (const status of Object.keys(PACKAGE_TRANSITIONS)) {
    assertEquals(Array.isArray(PACKAGE_TRANSITIONS[status]), true);
  }
});
