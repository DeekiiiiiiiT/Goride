/**
 * P3-R4: a company on toll v2 has no old toll period (toll_reconciliation_period). Week Reconciliation step 3
 * must follow the v2 seal, or it can never be completed for a v2 company.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const source = await Deno.readTextFile(join(here, "recon_routes.ts"));

Deno.test("step 3 count follows only the new toll system's seal (no old toll period)", () => {
  const start = source.indexOf("async function computeLiveStepCounts(");
  const fn = source.slice(start, source.indexOf("let fuelActionable", start));
  assert(
    fn.includes('let tollActionable = (await tollsV2WeekState(orgId, weekKey)) === "sealed" || (await isReconWeekFrozen(orgId, weekKey))'),
    "sealed or closed week → 0, else 1",
  );
  assert(!fn.includes("toll_reconciliation_period"), "no old toll period read");
});

Deno.test("the v2 week state never says sealed on a failed read and uses the service-only reads", () => {
  const fn = source.slice(source.indexOf("export async function tollsV2WeekState"), source.indexOf("async function computeLiveStepCounts("));
  assert(fn.includes('rpc("toll_sys_tolls_v2_on"'), "switch read");
  assert(fn.includes('rpc("toll_sys_week_drivers"'), "seal read");
  assert(fn.includes('return "open";') && fn.includes("catch (e)"), "a failed seal read answers open");
  assert(!fn.includes('return "sealed"'), "sealed only from the data");
});

Deno.test("a sealed toll statement is never compared with the old toll engine (S2)", async () => {
  const probe = await Deno.readTextFile(join(here, "statement_engine_probe.ts"));
  assert(!probe.includes('s.kind === "toll"'), "no toll branch in the statement compare");
  assert(!probe.includes("toll_close_amounts") && !probe.includes("probeTollEngine"), "old toll engine gone");
});

Deno.test("the week P&L tie reads tolls from the new toll system and fails closed (S2)", async () => {
  const pnl = await Deno.readTextFile(join(here, "business_week_pnl.ts"));
  assert(pnl.includes('rpc("toll_sys_week_drivers"'), "reads the new toll week result");
  assert(pnl.includes("toll.fleetMinor"), "uses the same net loss the toll statement records");
  const failed = pnl.slice(pnl.indexOf("if (tollErr)"), pnl.indexOf("if (tollErr)") + 200);
  assert(failed.includes("throw new Error("), "a failed toll read stops close (a null would only warn)");
});
