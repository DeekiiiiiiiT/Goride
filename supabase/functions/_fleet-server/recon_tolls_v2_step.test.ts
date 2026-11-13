/**
 * P3-R4: a company on toll v2 has no old toll period (toll_reconciliation_period). Week Reconciliation step 3
 * must follow the v2 seal, or it can never be completed for a v2 company.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const source = await Deno.readTextFile(join(here, "recon_routes.ts"));

Deno.test("step 3 count asks toll v2 first and is clear only when the toll week is sealed", () => {
  const start = source.indexOf("async function computeLiveStepCounts(");
  const fn = source.slice(start, source.indexOf("let fuelActionable", start));
  const v2 = fn.indexOf("await tollsV2WeekState(orgId, weekKey)");
  const oldPeriod = fn.indexOf("} else if (!tollPeriod) {");
  assert(v2 >= 0 && oldPeriod > v2, "v2 state decides before the old toll period");
  assert(fn.includes('tollActionable = tollsV2 === "sealed" ? 0 : 1;'), "sealed → 0, open → 1");
});

Deno.test("the v2 week state fails closed and uses the service-only reads", () => {
  const fn = source.slice(source.indexOf("export async function tollsV2WeekState"), source.indexOf("async function computeLiveStepCounts("));
  assert(fn.includes('rpc("toll_sys_tolls_v2_on"'), "switch read");
  assert(fn.includes('rpc("toll_sys_week_drivers"'), "seal read");
  assert(fn.includes('return "open";') && fn.includes("catch (e)"), "a failed seal read answers open, never sealed, and never breaks the week");
  const switchPart = fn.slice(0, fn.indexOf('rpc("toll_sys_week_drivers"'));
  assert(switchPart.includes("return null;") && !switchPart.includes('return "open"'),
    "a failed switch read hands step 3 back to the old toll period (a non-v2 company is never reopened)");
});

Deno.test("a v2 company's sealed toll statement is not compared with the old event-netting engine", async () => {
  const probe = await Deno.readTextFile(join(here, "statement_engine_probe.ts"));
  assert(probe.includes('if (s.kind === "toll" && tollsV2) continue;'), "toll compare skipped on v2");
  const fn = probe.slice(probe.indexOf("async function companyOnTollsV2"), probe.indexOf("export async function compareDriverWeekStatementsToEngines"));
  assert(fn.includes("return !error && data === true;"), "only a clear yes skips; a failed read keeps comparing");
});
