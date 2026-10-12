import { nextTaskState, type TaskState } from "./taskMachine.ts";

const PURCHASED = new Set([
  "placed_external",
  "ready_for_pickup",
  "picked_up",
  "closed",
  "exception_after_purchase",
]);

export function foodWasPurchased(state: string | null | undefined): boolean {
  return PURCHASED.has(String(state || ""));
}

export function customerStatusForTask(state: TaskState): "accepted" | "preparing" | "ready" | null {
  if (state === "queued") return "accepted";
  if (
    state === "claimed" ||
    state === "placing" ||
    state === "placed_external" ||
    state === "awaiting_customer" ||
    state === "exception_before_purchase" ||
    state === "exception_purchase_unknown" ||
    state === "exception_after_purchase"
  ) {
    return "preparing";
  }
  if (state === "ready_for_pickup") return "ready";
  return null;
}

export function transitionOrThrow(from: string, action: Parameters<typeof nextTaskState>[1]): TaskState {
  const next = nextTaskState(from as TaskState, action);
  if (!next) throw new Error(`forbidden:${from}:${action}`);
  return next;
}
