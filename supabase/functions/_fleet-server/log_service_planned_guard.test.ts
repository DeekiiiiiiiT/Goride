/**
 * deno test --no-check --node-modules-dir=none supabase/functions/_fleet-server/log_service_planned_guard.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPlannedWorkOrder,
  mapFleetAddFoundJobError,
  mapFleetPlanJobError,
  PLANNED_JOB_CONFLICT,
} from "./log_service_planned_guard.ts";

Deno.test("isPlannedWorkOrder", () => {
  assertEquals(isPlannedWorkOrder({ status: "planned" }), true);
  assertEquals(isPlannedWorkOrder({ status: "in_progress" }), false);
});

Deno.test("mapFleetPlanJobError", () => {
  assertEquals(mapFleetPlanJobError("position_invalid")?.code, "position_invalid");
  assertEquals(mapFleetPlanJobError("vehicle_not_found")?.status, 404);
  assertEquals(mapFleetPlanJobError("actor_required")?.status, 401);
});

Deno.test("planned conflict body", () => {
  assertEquals(PLANNED_JOB_CONFLICT.body.code, "planned_job");
});
Deno.test("mapFleetAddFoundJobError (LC-14)", () => {
  assertEquals(mapFleetAddFoundJobError("position_invalid")?.status, 400);
  assertEquals(mapFleetAddFoundJobError("service_not_found")?.status, 404);
  assertEquals(mapFleetAddFoundJobError("service_not_open_for_finds")?.status, 409);
  assertEquals(mapFleetAddFoundJobError("not_an_inspection")?.code, "not_an_inspection");
  assertEquals(mapFleetAddFoundJobError("job_is_inspection")?.status, 400);
  assertEquals(mapFleetAddFoundJobError("actor_required")?.status, 401);
  assertEquals(mapFleetAddFoundJobError("quote_invalid")?.status, 400);
  assertEquals(mapFleetAddFoundJobError("found_line_not_found")?.status, 404);
  assertEquals(mapFleetAddFoundJobError("found_line_not_open")?.status, 409);
  assertEquals(mapFleetAddFoundJobError("something else"), null);
});
