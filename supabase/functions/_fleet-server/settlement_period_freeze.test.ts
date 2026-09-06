import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertPeriodNotFrozen, isPeriodFrozen } from "./settlement_period_freeze.ts";

Deno.test("isPeriodFrozen detects signed / frozen metadata", () => {
  assertEquals(isPeriodFrozen(null), false);
  assertEquals(isPeriodFrozen({ settlementStatus: "settled" }), false);
  assertEquals(isPeriodFrozen({ signedAt: "2026-09-01" }), true);
  assertEquals(isPeriodFrozen({ metadata: { periodFrozen: true } }), true);
  assertEquals(isPeriodFrozen({ metadata: { financeCore: { signedAt: "x" } } }), true);
});

Deno.test("assertPeriodNotFrozen throws PERIOD_FROZEN", () => {
  try {
    assertPeriodNotFrozen({ signedAt: "2026-09-01" });
    throw new Error("expected throw");
  } catch (e) {
    assertEquals((e as Error & { code?: string }).code, "PERIOD_FROZEN");
  }
});
