/**
 * WRA-68: toll seal / reopen and fuel finalize only queue driver_week + desk refresh.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

function sliceSealReopenHandler(src: string): string {
  const marker = 'intent === "seal_week" || intent === "reopen_week"';
  const start = src.indexOf(marker);
  assert(start >= 0, "seal/reopen handler");
  const returnIdx = src.indexOf("return c.json(data)", start);
  assert(returnIdx > start, "handler end");
  return src.slice(start, returnIdx);
}

function sliceFuelPostSeal(src: string): string {
  const marker = "fuel_seal_error: null";
  const start = src.indexOf(marker);
  assert(start >= 0, "fuel post-seal block");
  const end = src.indexOf("} catch (sealErr:", start);
  assert(end > start, "fuel seal catch");
  return src.slice(start, end);
}

Deno.test("WRA-68: toll seal/reopen queues only — no inline rebuild or publish", async () => {
  const src = await Deno.readTextFile(new URL("./toll_v2_command_controller.ts", import.meta.url));
  const block = sliceSealReopenHandler(src);
  assert(block.includes("enqueueDriverWeekUnitsForWeek"), "enqueues driver weeks");
  assert(block.includes("queueWeekDeskRefresh"), "queues desk refresh");
  assert(!block.includes("runSealSideEffects"), "no runSealSideEffects");
  assert(!block.includes("rebuildPeriodsForAnchors"), "no period rebuild");
  assert(!block.includes("publishWeekDesk"), "no inline desk publish");
  assert(!block.includes("rush_delivery"), "not once per service line");
});

Deno.test("WRA-68: fuel finalize seal step queues only", async () => {
  const src = await Deno.readTextFile(new URL("./fuel_period_routes.ts", import.meta.url));
  const block = sliceFuelPostSeal(src);
  assert(block.includes("enqueueDriverWeekUnitsForWeek"), "enqueues driver weeks");
  assert(block.includes("queueWeekDeskRefresh"), "queues desk refresh");
  assert(!block.includes("runSealSideEffects"), "no runSealSideEffects");
  assert(!block.includes("rebuildPeriodsForAnchors"), "no period rebuild in seal block");
  assert(!block.includes("publishWeekDesk"), "no inline desk publish in seal block");
});