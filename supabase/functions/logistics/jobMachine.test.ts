import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canTransitionJob,
  JOB_TRANSITIONS,
  shipmentStatusToJobStatus,
  validateAssignPayload,
  isMarketplaceAssignee,
} from "./jobMachine.ts";

Deno.test("job transitions: unassigned may assign, match, or cancel", () => {
  assertEquals(canTransitionJob("unassigned", "assigned"), true);
  assertEquals(canTransitionJob("unassigned", "matching"), true);
  assertEquals(canTransitionJob("unassigned", "cancelled"), true);
  assertEquals(canTransitionJob("unassigned", "completed"), false);
});

Deno.test("job transitions: matching can assign or return to unassigned", () => {
  assertEquals(canTransitionJob("matching", "assigned"), true);
  assertEquals(canTransitionJob("matching", "unassigned"), true);
  assertEquals(JOB_TRANSITIONS.matching.includes("completed"), false);
});

Deno.test("job transitions: completed and cancelled are terminal", () => {
  assertEquals(JOB_TRANSITIONS.completed.length, 0);
  assertEquals(JOB_TRANSITIONS.cancelled.length, 0);
});

Deno.test("shipmentStatusToJobStatus preserves matching and assignment on booked", () => {
  assertEquals(shipmentStatusToJobStatus("booked", null), "unassigned");
  assertEquals(shipmentStatusToJobStatus("booked", "assigned"), "assigned");
  assertEquals(shipmentStatusToJobStatus("booked", "matching"), "matching");
  assertEquals(shipmentStatusToJobStatus("in_transit", "matching"), "matching");
  assertEquals(shipmentStatusToJobStatus("delivered", "in_progress"), "completed");
});

Deno.test("validateAssignPayload accepts marketplace without secondary refs", () => {
  const r = validateAssignPayload({ assigneeType: "roam_marketplace" });
  assertEquals(r.ok, true);
  assertEquals(isMarketplaceAssignee("roam_marketplace"), true);
});

Deno.test("validateAssignPayload requires carrier for third_party", () => {
  const r = validateAssignPayload({ assigneeType: "third_party" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "missing_carrier");
});

Deno.test("validateAssignPayload accepts org_fleet", () => {
  const r = validateAssignPayload({ assigneeType: "org_fleet" });
  assertEquals(r.ok, true);
});

Deno.test("validateAssignPayload requires client fleet asset", () => {
  const r = validateAssignPayload({ assigneeType: "client_fleet" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "missing_client_fleet_asset");
});
