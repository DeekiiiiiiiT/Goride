import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextTaskState, retryAllowed, TASK_STATES, type TaskAction, type TaskState } from "./taskMachine.ts";

const allowed: Array<[TaskState, TaskAction, TaskState]> = [
  ["queued", "claim", "claimed"],
  ["claimed", "release", "queued"],
  ["claimed", "start", "placing"],
  ["placing", "record_purchase", "placed_external"],
  ["placed_external", "dispatch", "ready_for_pickup"],
  ["ready_for_pickup", "pickup", "picked_up"],
  ["picked_up", "close", "closed"],
  ["placing", "exception", "exception_purchase_unknown"],
  ["exception_purchase_unknown", "abandon", "abandoned"],
  ["exception_purchase_unknown", "record_purchase", "placed_external"],
  ["placed_external", "exception", "exception_after_purchase"],
  ["exception_before_purchase", "retry", "queued"],
  ["exception_before_purchase", "substitute", "placing"],
  ["exception_before_purchase", "abandon", "abandoned"],
  ["exception_after_purchase", "wait", "ready_for_pickup"],
  ["exception_after_purchase", "redispatch", "ready_for_pickup"],
  ["exception_after_purchase", "abandon", "abandoned"],
  ["exception_before_purchase", "price_approved", "placing"],
];

Deno.test("procurement task machine allows the desk path", () => {
  for (const [from, action, to] of allowed) {
    assertEquals(nextTaskState(from, action), to);
  }
});

Deno.test("procurement task machine rejects closed and double purchase", () => {
  for (const state of TASK_STATES) {
    if (state === "placing" || state === "exception_purchase_unknown") continue;
    assertEquals(nextTaskState(state, "record_purchase"), null);
  }
  assertEquals(nextTaskState("closed", "exception"), null);
  assertEquals(nextTaskState("abandoned", "claim"), null);
  assertEquals(nextTaskState("queued", "dispatch"), null);
  assertEquals(nextTaskState("exception_after_purchase", "retry"), null);
  assertEquals(nextTaskState("closed", "price_approved"), null);
  assertEquals(retryAllowed("exception_before_purchase", true), false);
  assertEquals(retryAllowed("exception_before_purchase", false), true);
  assertEquals(retryAllowed("exception_after_purchase", false), false);
  assertEquals(retryAllowed("exception_purchase_unknown", false, false), false);
  assertEquals(retryAllowed("exception_purchase_unknown", false, true), true);
  assertEquals(retryAllowed("exception_purchase_unknown", true, true), false);
});
