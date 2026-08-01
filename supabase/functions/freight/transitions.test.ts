import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SHIPMENT_TRANSITIONS } from "./transitions.ts";

Deno.test("shipment transitions: draft may book or cancel", () => {
  assertEquals(SHIPMENT_TRANSITIONS.draft.includes("booked"), true);
  assertEquals(SHIPMENT_TRANSITIONS.draft.includes("cancelled"), true);
  assertEquals(SHIPMENT_TRANSITIONS.draft.includes("delivered"), false);
});

Deno.test("shipment transitions: cancelled and delivered are terminal", () => {
  assertEquals(SHIPMENT_TRANSITIONS.cancelled.length, 0);
  assertEquals(SHIPMENT_TRANSITIONS.delivered.length, 0);
});

Deno.test("shipment transitions: cannot skip booked → delivered", () => {
  assertEquals(SHIPMENT_TRANSITIONS.booked.includes("delivered"), false);
  assertEquals(SHIPMENT_TRANSITIONS.booked.includes("in_transit"), true);
});

Deno.test("shipment transitions: exception can resume", () => {
  assertEquals(SHIPMENT_TRANSITIONS.exception.includes("in_transit"), true);
  assertEquals(SHIPMENT_TRANSITIONS.exception.includes("cancelled"), true);
});
