/**
 * Old toll removal S1: closing a driver week never runs the old toll seal. When an OPEN driver's toll statement
 * isn't sealed, close is refused (before any lane is sealed) and points to Week Reconciliation step 3.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./week_close.ts", import.meta.url));
const lanes = src.slice(src.indexOf("async function ensureCloseLaneStatements("), src.indexOf("async function sealEarningsLaneForWeek"));

Deno.test("week close: no old toll seal; unsealed tolls refuse with TOLL_WEEK_NOT_SEALED", () => {
  assert(!src.includes("./toll_week_seal.ts") && !src.includes("./toll_seal_http.ts"), "old seal not imported");
  assert(!/sealTollWeek(ViaHttp)?\(/.test(src), "old seal never called");
  assert(lanes.includes('cause: "TOLL_WEEK_NOT_SEALED"') && lanes.includes("Week Reconciliation step 3"), "clear refusal");
});

Deno.test("week close: only open drivers count, and the toll check runs before fuel is sealed", () => {
  assert(lanes.includes('if (!frozen && (!toll || toll.status !== "closed")) tollUnsealedOpenDriver = true;'), "open drivers only");
  const refuse = lanes.indexOf("if (tollUnsealedOpenDriver)");
  const fuel = lanes.indexOf("sealFuelWeekViaHttp(");
  assert(refuse > 0 && fuel > refuse, "refusal before the fuel seal");
  assert(!lanes.includes("forceTollReseal"), "a toll re-seal request is a no-op (step 3 re-seals)");
});

Deno.test("week close: no toll second pass and no old toll-event orphan scan", () => {
  assert(!src.includes("orgWeekNeedsForceTollReseal"), "second pass gone");
  assert(!src.includes("summarizeTollUsageOrphansByDriverForWeek"), "orphan scan gone");
  assert(!src.includes('=== "zero_activity_na"'), "an old zero statement is a sealed statement");
});
