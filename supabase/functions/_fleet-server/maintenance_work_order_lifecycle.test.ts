import { assertEquals } from "jsr:@std/assert";
import { workOrderTransitionSideEffects } from "./maintenance_work_order_lifecycle.ts";

Deno.test("in_shop to awaiting_parts does not set back_on_road_at", () => {
  const patch = workOrderTransitionSideEffects("in_shop", "awaiting_parts", "2026-01-01T00:00:00.000Z");
  assertEquals(patch.back_on_road_at, undefined);
});

Deno.test("in_shop to completed sets back_on_road_at", () => {
  const patch = workOrderTransitionSideEffects("in_shop", "completed", "2026-01-01T00:00:00.000Z");
  assertEquals(patch.back_on_road_at, "2026-01-01T00:00:00.000Z");
});

Deno.test("awaiting_parts to scheduled sets back_on_road_at", () => {
  const patch = workOrderTransitionSideEffects("awaiting_parts", "scheduled", "2026-01-01T00:00:00.000Z");
  assertEquals(patch.back_on_road_at, "2026-01-01T00:00:00.000Z");
});
