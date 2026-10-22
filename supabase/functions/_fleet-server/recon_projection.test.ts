import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  advanceCloseWorkflow,
  canonicalFactLines,
  driftKindToBlockerCode,
  nextAttemptStatus,
  plainComputeFailure,
  projectionStatusLine,
  sha256Hex,
  shouldEnqueueUnit,
} from "./recon_projection.ts";

Deno.test("a second edit while a unit is pending does not add another job", () => {
  assertEquals(shouldEnqueueUnit("pending"), false);
  assertEquals(shouldEnqueueUnit("fresh"), true);
  assertEquals(shouldEnqueueUnit(null), true);
});

Deno.test("five failed attempts park the unit", () => {
  assertEquals(nextAttemptStatus(4), "pending");
  assertEquals(nextAttemptStatus(5), "failed");
});

Deno.test("stored drift kinds map onto the close step codes", () => {
  assertEquals(driftKindToBlockerCode("fuel"), "FUEL_ENGINE_DRIFT");
  assertEquals(driftKindToBlockerCode("toll"), "TOLL_ENGINE_DRIFT");
  assertEquals(driftKindToBlockerCode("earnings"), "EARNINGS_ENGINE_DRIFT");
});

Deno.test("fact lines sort so the same facts always hash the same", async () => {
  const a = canonicalFactLines(
    [
      { id: "b", updatedAt: "2", amount: 10 },
      { id: "a", updatedAt: "1", amount: 5 },
    ],
    "policy-1",
  );
  const b = canonicalFactLines(
    [
      { id: "a", updatedAt: "1", amount: 5 },
      { id: "b", updatedAt: "2", amount: 10 },
    ],
    "policy-1",
  );
  assertEquals(a, b);
  assertEquals(await sha256Hex(a), await sha256Hex(b));
});

Deno.test("status line counts drivers and never mentions the server limit", () => {
  assertEquals(projectionStatusLine(3, 0, 28), "Updating 3 of 28 drivers");
  assertEquals(projectionStatusLine(0, 1, 28), "Could not update 1 driver");
  assertEquals(projectionStatusLine(0, 0, 28), null);
  assertEquals(
    plainComputeFailure("Function failed due to not having enough compute resources (please check logs)."),
    "This week is still updating. Wait a minute and try again.",
  );
});

Deno.test("a 30-driver week closes only after every unit is quiet and nothing blocks", () => {
  const waiting = advanceCloseWorkflow({
    step: "waiting",
    pending: 30,
    hashMismatches: 0,
    blockers: 0,
  });
  assertEquals(waiting, { step: "waiting", state: "running" });

  const blocked = advanceCloseWorkflow({
    step: "checking",
    pending: 0,
    hashMismatches: 0,
    blockers: 1,
  });
  assertEquals(blocked.state, "blocked");

  const ready = advanceCloseWorkflow({
    step: "checking",
    pending: 0,
    hashMismatches: 0,
    blockers: 0,
  });
  assertEquals(ready, { step: "freezing", state: "running" });

  const done = advanceCloseWorkflow({
    step: "freezing",
    pending: 0,
    hashMismatches: 0,
    blockers: 0,
  });
  assertEquals(done, { step: "done", state: "succeeded" });
});
