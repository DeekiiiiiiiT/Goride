/**
 * Guard: quarantine stamp must reverse toll_usage (events-path spend).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CONTROLLER = new URL("./toll_controller.tsx", import.meta.url);
const RESET = new URL("./toll_financial_reset.ts", import.meta.url);

Deno.test("toll_financial_reset exports reverseTollUsageEventsForQuarantine", async () => {
  const src = await Deno.readTextFile(RESET);
  assert(
    /export async function reverseTollUsageEventsForQuarantine/.test(src),
    "missing reverseTollUsageEventsForQuarantine export",
  );
  assert(
    /toll_ledger_quarantined/.test(src),
    "quarantine reverse must use reason toll_ledger_quarantined",
  );
  assert(
    /export async function ensureActiveTollUsagePostedForEntry/.test(src),
    "missing ensureActiveTollUsagePostedForEntry for un-quarantine re-post",
  );
});

Deno.test("quarantine-report stamp reverses toll_usage events", async () => {
  const src = await Deno.readTextFile(CONTROLLER);
  assert(
    /reverseTollUsageEventsForQuarantine/.test(src),
    "quarantine-report must call reverseTollUsageEventsForQuarantine",
  );
  assert(
    /quarantine-report[\s\S]*reverseTollUsageEventsForQuarantine/.test(src),
    "reverse must be wired on the quarantine-report stamp path",
  );
  assert(
    /isTollQuarantined\(entry\)[\s\S]*reverseTollUsageEventsForQuarantine/.test(src) ||
      /if \(isTollQuarantined\(entry\)\)/.test(src),
    "saveTollLedgerEntry must reverse when saving a quarantined usage row",
  );
});
