import { assertEquals } from "jsr:@std/assert@1";
import { daysOffRoad, garageName, workOrderStage } from "./maintenance_work_order_board_routes.ts";

Deno.test("step 11: each work order status lands in one stage of the tab; planned never shows", () => {
  assertEquals(workOrderStage("draft"), "decision");
  assertEquals(workOrderStage("open"), "waiting");
  assertEquals(workOrderStage("scheduled"), "waiting");
  assertEquals(workOrderStage("in_shop"), "garage");
  assertEquals(workOrderStage("awaiting_parts"), "garage");
  assertEquals(workOrderStage("in_progress"), "saving");
  assertEquals(workOrderStage("completed"), "done");
  assertEquals(workOrderStage("closed"), "done");
  assertEquals(workOrderStage("cancelled"), "cancelled");
  assertEquals(workOrderStage("planned"), null);
});

Deno.test("step 11: days off the road and the garage's name", () => {
  const now = new Date("2026-11-27T15:00:00Z");
  assertEquals(daysOffRoad("2026-11-26T09:30:00Z", now), 1);
  assertEquals(daysOffRoad("2026-11-27T09:30:00Z", now), 0);
  assertEquals(daysOffRoad(null, now), null);
  assertEquals(garageName("Whol-Hearted Car Service Ltd", "x"), "Whol-Hearted Car Service Ltd");
  assertEquals(garageName(null, "Driver Request"), null);
  assertEquals(garageName(null, "Amigo Auto Parts"), "Amigo Auto Parts");
});
