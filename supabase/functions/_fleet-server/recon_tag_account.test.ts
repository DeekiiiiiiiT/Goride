/**
 * Tag account opening reset — finance-core wiring and route contract (read-only).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  buildTagAccountOpeningResetPayload,
  effectiveTagOpeningReset,
  tagAccountRollAfterReset,
  tagAccountUseOldTollRecords,
} from "../../../packages/finance-core/src/tagAccountRollForward.ts";

const here = dirname(fromFileUrl(import.meta.url));
const routes = await Deno.readTextFile(join(here, "recon_routes.ts"));

Deno.test("reset payload zeros variance for 2026-11-16 fixture", () => {
  const payload = buildTagAccountOpeningResetPayload({
    statementClosingMinor: 22_500,
    previousOpeningMinor: 86_900,
    topUpsMinor: 500_000,
    tagUsageMinor: 619_000,
    reason: "test",
  });
  const roll = tagAccountRollAfterReset({
    topUpsMinor: 500_000,
    tagUsageMinor: 619_000,
    reset: { ...payload, reason: payload.reason ?? "test" },
  });
  assertEquals(roll.varianceMinor, 0);
  assert(roll.ties);
  assertEquals(roll.openingMinor, 141_500);
});

Deno.test("effectiveTagOpeningReset undo clears active reset", () => {
  const payload = buildTagAccountOpeningResetPayload({
    statementClosingMinor: 22_500,
    previousOpeningMinor: 86_900,
    topUpsMinor: 500_000,
    tagUsageMinor: 619_000,
    reason: "r",
  });
  const events = [
    { id: 10, kind: "tag_account_opening_reset", payload },
    { id: 11, kind: "tag_account_opening_reset_undo", payload: { undoesEventId: 10 } },
  ];
  assertEquals(effectiveTagOpeningReset(events), null);
});

Deno.test("weeks after anchor do not use old toll records at or before reset week", () => {
  assertEquals(tagAccountUseOldTollRecords({ resetAnchorWeekKey: "2026-11-16", weekKey: "2026-11-16" }), false);
  assertEquals(tagAccountUseOldTollRecords({ resetAnchorWeekKey: "2026-11-16", weekKey: "2026-11-23" }), true);
});

Deno.test("events route handles opening reset kinds with reason", () => {
  const start = routes.indexOf('app.post(\n    `${BASE}/runs/:line/:weekKey/events`');
  const block = routes.slice(start, start + 3500);
  assert(block.includes('tag_account_opening_reset'));
  assert(block.includes('tag_account_opening_reset_undo'));
  assert(block.includes("reason?: string"));
  assert(block.includes("buildOpeningResetPayloadForWeek"));
});

Deno.test("computeLiveStepCounts still probes tag_account roll variance", () => {
  const start = routes.indexOf("async function computeLiveStepCounts(");
  const end = routes.indexOf("async function ", start + 10);
  const fn = routes.slice(start, end > start ? end : start + 4000);
  assert(fn.includes("tagAccountRollFor"));
  assert(fn.includes("roll.varianceMinor != null && !roll.ties"));
});