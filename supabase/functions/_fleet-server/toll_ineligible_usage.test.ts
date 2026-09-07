/**
 * Guard: ineligible-usage report + eligibility-aware summarize (Audit §10).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const RESET = new URL("./toll_financial_reset.ts", import.meta.url);
const PERIOD = new URL("./toll_period_controller.tsx", import.meta.url);

Deno.test("toll_financial_reset exports ineligible report helpers", async () => {
  const src = await Deno.readTextFile(RESET);
  assert(
    /export async function reportOrReverseIneligibleTollUsage/.test(src),
    "missing reportOrReverseIneligibleTollUsage",
  );
  assert(
    /toll_ledger_ineligible_restatement/.test(src),
    "apply must use toll_ledger_ineligible_restatement reason",
  );
  assert(
    /ineligibleEventCount/.test(src),
    "summarize must report ineligibleEventCount",
  );
  assert(
    /amountMismatchCount/.test(src),
    "summarize must report amountMismatchCount",
  );
  assert(
    /isTollIncludedInSpend\(integrity\)/.test(src),
    "missing-event scan must skip non-spend rows via isTollIncludedInSpend",
  );
});

Deno.test("toll period controller wires ineligible-usage-report", async () => {
  const src = await Deno.readTextFile(PERIOD);
  assert(
    /ineligible-usage-report/.test(src),
    "missing ineligible-usage-report route",
  );
  assert(
    /reportOrReverseIneligibleTollUsage/.test(src),
    "route must call reportOrReverseIneligibleTollUsage",
  );
});
