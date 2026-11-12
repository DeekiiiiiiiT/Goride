import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { wakeShouldReturn, workflowMoved } from "./recon_worker_wake.ts";

/**
 * Rev 24: a close that is only waiting is not work. Before the fix every waiting close
 * counted, so each calculator wake looped for its whole 90 s budget (seen: 3,809 passes).
 */
Deno.test("a wake with only a waiting close returns at once", () => {
  assertEquals(wakeShouldReturn({ processed: 0, workflows: 0, elapsedMs: 50 }), true);
  assertEquals(wakeShouldReturn({ processed: 0, workflows: 1, elapsedMs: 50 }), false);
});

Deno.test("advanceOpenCloseWorkflows counts only workflows that moved", async () => {
  const src = await Deno.readTextFile(new URL("./recon_close_workflow.ts", import.meta.url));
  const i = src.indexOf("export async function advanceOpenCloseWorkflows");
  const body = src.slice(i, src.indexOf("\n}\n", i));
  assert(/const after = await advanceOneCloseWorkflow\(row\);/.test(body), "keeps the result");
  assert(/if \(workflowMoved\(row, after\)\) n \+= 1;/.test(body), "counts only a move");
  assert(!/^\s*n \+= 1;\s*$/m.test(body.replace(/if \(workflowMoved\(row, after\)\) n \+= 1;/, "")), "no unconditional count");
});

Deno.test("workflowMoved: same state, step and message = not moved", () => {
  const w = { state: "running", step: "waiting", error: "The nightly check has not cleared yet." };
  assertEquals(workflowMoved(w, { ...w }), false);
  assertEquals(workflowMoved(w, { ...w, step: "freezing" }), true);
  assertEquals(workflowMoved(w, { ...w, state: "succeeded" }), true);
  assertEquals(workflowMoved(w, { ...w, error: null }), true);
});

Deno.test("Rev 24: a refused money close never marks the week closed in Week Reconciliation", async () => {
  const src = await Deno.readTextFile(new URL("./recon_close_workflow.ts", import.meta.url));
  const i = src.indexOf("const result = await closeWeek(");
  const after = src.slice(i, src.indexOf("const state = result.closed", i));
  assert(/if \(result\.closed\) \{\s*try \{\s*await markReconWeekRunClosed\(/.test(after), "mark closed only after a real close");
});

Deno.test("Rev 24: a week with no driver weeks can close (both close paths)", async () => {
  const src = await Deno.readTextFile(new URL("./week_close.ts", import.meta.url));
  const rules = src.match(/const weekClosed = driversBlocked === 0 && \(perDriver\.length > 0 \|\| periodRows\.length === 0\);/g) ?? [];
  assertEquals(rules.length, 2);
  assert(!/const weekClosed = driversBlocked === 0 && perDriver\.length > 0;/.test(src), "old rule gone");
});
