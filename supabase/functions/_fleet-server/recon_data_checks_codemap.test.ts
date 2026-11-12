/**
 * Data rule 2 (supabase/tests/week_recon_data_checks.sql) maps every blocker code
 * to its step. That SQL list must match SERVER_STEP_BY_BLOCKER exactly, or the
 * nightly check would miss (or invent) differences.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { SERVER_STEP_BY_BLOCKER } from "../../../packages/finance-core/src/closeBlockerSteps.ts";

Deno.test("data rule 2 code list = SERVER_STEP_BY_BLOCKER", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const sql = await Deno.readTextFile(join(here, "../../tests/week_recon_data_checks.sql"));
  const start = sql.indexOf("-- Rule 2");
  const end = sql.indexOf("-- Rule 3");
  const block = sql.slice(start, end);
  const pairs = [...block.matchAll(/\('([A-Z_]+)',\s*'([a-z_]+)'\)/g)].map((m) => [m[1], m[2]]);
  assertEquals(
    Object.fromEntries(pairs),
    { ...SERVER_STEP_BY_BLOCKER },
  );
});
