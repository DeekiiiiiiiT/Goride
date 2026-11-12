/**
 * Rule 4 (WRA-06, 08, 13): opening the week list or a week never writes,
 * never creates the week, never recalculates and never queues work.
 * The handlers read stored rows only; the calculator builds the desk.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const source = await Deno.readTextFile(join(here, "recon_routes.ts"));

/** The text of one route registration, up to the next registration. */
function handlerBlock(method: "get" | "post", path: string): string {
  const marker = `app.${method}(\n    \`\${BASE}${path}\`,`;
  const start = source.indexOf(marker);
  assert(start >= 0, `route not found: ${method.toUpperCase()} ${path}`);
  const next = source.indexOf("\n  app.", start + marker.length);
  return source.slice(start, next < 0 ? undefined : next);
}

const WRITES = [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
  "ensureWeekRun",
  "buildRunPayload",
  "computeWeekDesk",
  "publishDeskBuild",
  "publishWeekDesk",
  "requestWeekDesk",
  "recon_enqueue",
  "compute_source_coverage",
  "fetchCoverageMap",
  "list_week_source_summaries",
  "overlayLiveStepGates",
  "computeLiveStepCounts",
];

for (const [method, path] of [
  ["get", "/weeks"],
  ["get", "/runs/:line/:weekKey"],
  ["get", "/runs/:line/:weekKey/tag-account"],
] as const) {
  Deno.test(`GET ${path} only reads`, () => {
    const block = handlerBlock(method, path);
    for (const token of WRITES) {
      assert(!block.includes(token), `GET ${path} must not use ${token}`);
    }
  });
}

Deno.test("no route creates a week (WRA-13)", () => {
  assert(!source.includes("async function ensureWeekRun"), "ensureWeekRun must stay deleted");
  assert(!/from\("week_runs"\)\s*\.insert\(/.test(source), "week_runs inserts belong to the calculator");
});

Deno.test("every changing route answers WEEK_NOT_READY for a week that does not exist yet", () => {
  for (const path of [
    "/runs/:line/:weekKey/sources/:sourceId/attest-none",
    "/runs/:line/:weekKey/sources/:sourceId/waive",
    "/runs/:line/:weekKey/events",
    "/runs/:line/:weekKey/attribution",
    "/runs/:line/:weekKey/steps/:stepId/complete",
    "/runs/:line/:weekKey/sources/:sourceId/request",
  ]) {
    const block = handlerBlock("post", path);
    assert(block.includes("loadWeekRun("), `${path} loads the stored week`);
    assert(block.includes("if (!run) return weekNotReady(c);"), `${path} refuses a missing week`);
  }
  assertEquals((source.match(/WEEK_NOT_READY/g) ?? []).length, 1, "one shared refusal");
});

Deno.test("the desk is saved in one transaction (WRA-29)", () => {
  assert(source.includes('rpc("publish_week_desk"'), "desk publish goes through recon.publish_week_desk");
  assert(!/from\("run_steps"\)\.upsert\(rows/.test(source), "no separate step-count writer");
  assert(!/desk_snapshot:\s*payload/.test(source), "no separate snapshot writer");
});

Deno.test("Round 2b: every changing route goes through withWeekChange (no private version bumps)", () => {
  for (const path of [
    "/runs/:line/:weekKey/sources/:sourceId/attest-none",
    "/runs/:line/:weekKey/sources/:sourceId/waive",
    "/runs/:line/:weekKey/events",
    "/runs/:line/:weekKey/attribution",
    "/runs/:line/:weekKey/steps/:stepId/complete",
    "/runs/:line/:weekKey/sources/:sourceId/request",
  ]) {
    const block = handlerBlock("post", path);
    assert(block.includes("withWeekChange(c, {"), `${path} uses the shared wrapper`);
    assert(block.includes("expectedVersion: body.expectedVersion"), `${path} passes the week version`);
    assert(block.includes("idempotencyKeyFrom(c,"), `${path} is repeat-safe`);
  }
  assert(!source.includes("bumpRunVersion"), "no private version bump");
  assert(!source.includes("appendRunEvent"), "history rows are written by the claim");
});

Deno.test("Round 2b-2: approval routes exist and the reopen route refuses legacy weeks", async () => {
  for (const path of ["/approvals", "/approvals/:id/withdraw", "/approvals/:id/reject", "/approvals/:id/approve"]) {
    handlerBlock("post", path);
  }
  const approve = handlerBlock("post", "/approvals/:id/approve");
  assert(approve.indexOf("decideApprove(") < approve.indexOf('"approved", actor, "approval_approved"'),
    "Approve checks the request before claiming it");
  assert(approve.indexOf('"approved", actor, "approval_approved"') < approve.indexOf("runApprovedAction("),
    "Approve claims the request before running the action (two approvers cannot both run it)");
  const controller = await Deno.readTextFile(join(here, "week_close_controller.tsx"));
  const reopenStart = controller.indexOf("app.post(`${BASE}/reopen`");
  const reopen = controller.slice(reopenStart, controller.indexOf("app.post(", reopenStart + 10));
  assert(reopen.includes("isLegacyCleanupWeek(") && reopen.includes("LEGACY_CLOSED"), "reopen refuses legacy weeks");
});
