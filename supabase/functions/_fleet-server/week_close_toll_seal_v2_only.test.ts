/**
 * Old toll removal S1: closing a driver week never runs the old toll seal. When a driver's toll statement isn't
 * sealed, close is refused and points to Week Reconciliation step 3 (the new toll seal writes the statements).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./week_close.ts", import.meta.url));

Deno.test("week close: no old toll seal, unsealed tolls refuse with TOLL_WEEK_NOT_SEALED", () => {
  assert(!src.includes("./toll_week_seal.ts") && !src.includes("./toll_seal_http.ts"), "old seal not imported");
  assert(!/sealTollWeek(ViaHttp)?\(/.test(src), "old seal never called");
  assert(src.includes('cause: "TOLL_WEEK_NOT_SEALED"') && src.includes("Week Reconciliation step 3"), "clear refusal");
});

Deno.test("week close: a period/statement toll drift alone does not force a toll re-seal", () => {
  assert(!src.includes("periodSync.preRebuildTollDriftCount > 0 ||"), "drift handled by the period rebuild");
});
