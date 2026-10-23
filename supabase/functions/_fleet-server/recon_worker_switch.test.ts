import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  largerFleetHold,
  minInstancesFromService,
  weekCalculatorStatus,
} from "./recon_worker_switch.ts";
import { wakeShouldReturn } from "./recon_worker_wake.ts";

const NOW = "2026-10-22T22:00:00.000Z";

Deno.test("emergency stop wins over waiting work", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: true,
    queueWaiting: 4,
    closeRunning: true,
    nightlyInProgress: true,
    lastFinishKind: "shadow_ok",
  });
  assertEquals(status.state, "stopped");
});

Deno.test("a waiting update shows Working", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: false,
    queueWaiting: 1,
    closeRunning: false,
    nightlyInProgress: false,
    lastFinishKind: "shadow_ok",
  });
  assertEquals(status.state, "working");
});

Deno.test("a close that is still running shows Working", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: false,
    queueWaiting: 0,
    closeRunning: true,
    nightlyInProgress: false,
    lastFinishKind: "shadow_ok",
  });
  assertEquals(status.state, "working");
});

Deno.test("a nightly check that has not finished shows Working", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: false,
    queueWaiting: 0,
    closeRunning: false,
    nightlyInProgress: true,
    lastFinishKind: "shadow_mismatch",
  });
  assertEquals(status.state, "working");
});

Deno.test("nothing waiting and a clean check is Idle", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: false,
    queueWaiting: 0,
    closeRunning: false,
    nightlyInProgress: false,
    lastFinishKind: "shadow_ok",
  });
  assertEquals(status.state, "idle");
  assertEquals(status.message.includes("starts on its own"), true);
});

Deno.test("a money difference with nothing waiting needs a look", () => {
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: false,
    queueWaiting: 0,
    closeRunning: false,
    nightlyInProgress: false,
    lastFinishKind: "shadow_mismatch",
  });
  assertEquals(status.state, "needs_a_look");
});

Deno.test("a calculator that cannot be read is disconnected", () => {
  const status = weekCalculatorStatus({
    connected: false,
    emergencyOff: false,
    queueWaiting: 0,
    closeRunning: false,
    nightlyInProgress: false,
    lastFinishKind: null,
  });
  assertEquals(status.state, "disconnected");
});

Deno.test("seven clean nights in a row release the larger-fleet hold", () => {
  const nights = Array.from({ length: 7 }, (_, i) => ({
    at: `2026-10-${String(16 + i).padStart(2, "0")}T02:00:00.000Z`,
    kind: "shadow_ok",
    mismatches: 0,
  }));
  assertEquals(largerFleetHold(nights, "2026-10-22T22:00:00.000Z"), false);
});

Deno.test("a gap in the nights keeps the larger-fleet hold", () => {
  const nights = [
    { at: "2026-10-16T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-17T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-19T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-20T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-21T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-22T02:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
  ];
  assertEquals(largerFleetHold(nights, NOW), true);
});

Deno.test("one money difference in the week keeps the larger-fleet hold", () => {
  const nights = Array.from({ length: 7 }, (_, i) => ({
    at: `2026-10-${String(16 + i).padStart(2, "0")}T02:00:00.000Z`,
    kind: i === 3 ? "shadow_mismatch" : "shadow_ok",
    mismatches: i === 3 ? 2 : 0,
  }));
  assertEquals(largerFleetHold(nights, NOW), true);
});

Deno.test("two results on the same night still count as one night", () => {
  const nights = [
    { at: "2026-10-22T18:00:00.000Z", kind: "shadow_ok", mismatches: 0 },
    { at: "2026-10-22T02:00:00.000Z", kind: "shadow_mismatch", mismatches: 4 },
    ...Array.from({ length: 6 }, (_, i) => ({
      at: `2026-10-${String(16 + i).padStart(2, "0")}T02:00:00.000Z`,
      kind: "shadow_ok",
      mismatches: 0,
    })),
  ];
  assertEquals(largerFleetHold(nights, NOW), false);
});

Deno.test("the awake setting is read from the computer, not the outer row", () => {
  assertEquals(minInstancesFromService({
    scaling: {},
    template: { scaling: { minInstanceCount: 1 } },
  }), 1);
  assertEquals(minInstancesFromService({ template: { scaling: { minInstanceCount: 0 } } }), 0);
  assertEquals(minInstancesFromService({ scaling: { minInstanceCount: 1 } }), 1);
  assertEquals(minInstancesFromService({}), 0);
});

Deno.test("a wake returns when the queue is empty", () => {
  assertEquals(wakeShouldReturn({ processed: 0, workflows: 0, elapsedMs: 10 }), true);
});

Deno.test("a wake keeps going while drivers are still updating", () => {
  assertEquals(wakeShouldReturn({ processed: 2, workflows: 0, elapsedMs: 10 }), false);
});

Deno.test("a wake returns when the time budget is used up", () => {
  assertEquals(wakeShouldReturn({ processed: 2, workflows: 1, elapsedMs: 90_000, budgetMs: 90_000 }), true);
});
