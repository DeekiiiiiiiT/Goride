/**
 * §1.3 — Personal resolve must write both toll_charge path partners
 * (charged_to_driver + personal offset). Target IDs stay fixed for the heal.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SEP11_PERSONAL_TOLL_IDS } from "./heal_personal_toll_pnl_events.ts";
import { buildCanonicalTollEventFromTollLedger } from "./canonical_from_ops.ts";

Deno.test("§1.3 heal targets are the two audited Sep personal tolls", () => {
  assertEquals(SEP11_PERSONAL_TOLL_IDS.length, 2);
  assertEquals(SEP11_PERSONAL_TOLL_IDS[0].startsWith("090bd599"), true);
  assertEquals(SEP11_PERSONAL_TOLL_IDS[1].startsWith("ea0380fb"), true);
});

Deno.test("§1.3 usage ledger builds toll_charge idempotency keys for heal targets", () => {
  for (const id of SEP11_PERSONAL_TOLL_IDS) {
    const ev = buildCanonicalTollEventFromTollLedger({
      id,
      date: "2026-09-11",
      driverId: "73e5b1dc-01b4-45ee-a34a-25a3256b9841",
      amount: -275,
      type: "usage",
      description: "Toll crossing: Spanish Town",
    });
    assertEquals(ev?.eventType, "toll_charge");
    assertEquals(ev?.idempotencyKey, `toll_ledger:${id}|toll_charge`);
  }
});
