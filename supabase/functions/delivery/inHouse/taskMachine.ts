/** Pure procurement task transitions. One task, one external purchase. */

export const TASK_STATES = [
  "queued",
  "claimed",
  "placing",
  "placed_external",
  "ready_for_pickup",
  "picked_up",
  "closed",
  "exception_before_purchase",
  "exception_after_purchase",
  "awaiting_customer",
  "abandoned",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export type TaskAction =
  | "claim"
  | "release"
  | "start"
  | "record_purchase"
  | "dispatch"
  | "pickup"
  | "close"
  | "exception"
  | "await_customer"
  | "retry"
  | "abandon"
  | "substitute"
  | "wait"
  | "redispatch"
  | "price_approved";

const BEFORE = new Set<TaskState>(["queued", "claimed", "placing", "awaiting_customer"]);
const AFTER = new Set<TaskState>(["placed_external", "ready_for_pickup", "picked_up"]);

const EDGES: Record<TaskState, Partial<Record<TaskAction, TaskState>>> = {
  queued: { claim: "claimed" },
  claimed: { release: "queued", start: "placing" },
  placing: { record_purchase: "placed_external", release: "queued" },
  placed_external: { dispatch: "ready_for_pickup" },
  ready_for_pickup: { pickup: "picked_up" },
  picked_up: { close: "closed" },
  closed: {},
  exception_before_purchase: {
    await_customer: "awaiting_customer",
    retry: "queued",
    substitute: "placing",
    abandon: "abandoned",
    price_approved: "placing",
  },
  exception_after_purchase: {
    wait: "ready_for_pickup",
    redispatch: "ready_for_pickup",
    abandon: "abandoned",
  },
  awaiting_customer: {
    start: "placing",
    retry: "queued",
    abandon: "abandoned",
    price_approved: "placing",
  },
  abandoned: {},
};

export function nextTaskState(from: TaskState, action: TaskAction): TaskState | null {
  if (action === "exception") {
    if (BEFORE.has(from)) return "exception_before_purchase";
    if (AFTER.has(from)) return "exception_after_purchase";
    return null;
  }
  return EDGES[from][action] ?? null;
}

export function assertTaskTransition(from: TaskState, action: TaskAction): TaskState {
  const next = nextTaskState(from, action);
  if (!next) throw new Error(`forbidden:${from}:${action}`);
  return next;
}

/** A purchase journal means the food was bought. Retry must not run. */
export function retryAllowed(from: TaskState, purchaseJournalExists: boolean): boolean {
  if (purchaseJournalExists) return false;
  return nextTaskState(from, "retry") === "queued";
}
