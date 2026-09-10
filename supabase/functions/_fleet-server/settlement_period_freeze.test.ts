import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertPeriodEndedForSettlement,
  assertPeriodEndedForReconciliation,
  assertPeriodNotFrozen,
  clearPeriodFreeze,
  isPeriodFrozen,
  markPeriodFrozen,
} from "./settlement_period_freeze.ts";
import { SettlementCommandError } from "./settlement_commands.ts";

Deno.test("isPeriodFrozen detects signed / frozen metadata", () => {
  assertEquals(isPeriodFrozen(null), false);
  assertEquals(isPeriodFrozen({ settlementStatus: "settled" }), false);
  assertEquals(isPeriodFrozen({ signedAt: "2026-09-01" }), true);
  assertEquals(isPeriodFrozen({ metadata: { periodFrozen: true } }), true);
  assertEquals(isPeriodFrozen({ metadata: { financeCore: { signedAt: "x" } } }), true);
});

Deno.test("assertPeriodNotFrozen throws PERIOD_FROZEN SettlementCommandError 409", () => {
  try {
    assertPeriodNotFrozen({ signedAt: "2026-09-01" });
    throw new Error("expected throw");
  } catch (e) {
    assertEquals(e instanceof SettlementCommandError, true);
    assertEquals((e as SettlementCommandError).code, "PERIOD_FROZEN");
    assertEquals((e as SettlementCommandError).status, 409);
  }
});

Deno.test("assertMovementAllowed fails closed when moneyUnlocked missing", async () => {
  const { assertMovementAllowed } = await import("./settlement_period_freeze.ts");
  try {
    assertMovementAllowed({
      weekAnchor: "2026-08-24",
      period: { metadata: { financeCore: {} } },
      requireMoneyUnlocked: true,
      now: "2026-09-08",
    });
    throw new Error("expected throw");
  } catch (e) {
    assertEquals(e instanceof SettlementCommandError, true);
    assertEquals((e as SettlementCommandError).code, "MONEY_LOCKED");
  }
});

Deno.test("assertMovementAllowed blocks frozen week with 409", async () => {
  const { assertMovementAllowed } = await import("./settlement_period_freeze.ts");
  try {
    assertMovementAllowed({
      weekAnchor: "2026-08-24",
      period: {
        metadata: { financeCore: { moneyUnlocked: true, periodFrozen: true } },
      },
      now: "2026-09-08",
    });
    throw new Error("expected throw");
  } catch (e) {
    assertEquals(e instanceof SettlementCommandError, true);
    assertEquals((e as SettlementCommandError).code, "PERIOD_FROZEN");
    assertEquals((e as SettlementCommandError).status, 409);
  }
});

Deno.test("assertPeriodEndedForSettlement blocks through periodEnd Sunday", () => {
  try {
    assertPeriodEndedForSettlement("2026-08-31", "2026-09-06");
    throw new Error("expected throw");
  } catch (e) {
    assertEquals(e instanceof SettlementCommandError, true);
    assertEquals((e as SettlementCommandError).code, "PERIOD_NOT_ENDED");
  }
});

Deno.test("assertPeriodEndedForSettlement allows from the next calendar day", () => {
  assertPeriodEndedForSettlement("2026-08-31", "2026-09-07");
});

Deno.test("assertPeriodEndedForReconciliation blocks Sep 7–13 through Sunday", () => {
  try {
    assertPeriodEndedForReconciliation("2026-09-07", "2026-09-13");
    throw new Error("expected throw");
  } catch (e) {
    assertEquals(e instanceof SettlementCommandError, true);
    assertEquals((e as SettlementCommandError).code, "PERIOD_NOT_ENDED");
    assertEquals(String((e as SettlementCommandError).message).includes("Reconciliation"), true);
  }
});

Deno.test("assertPeriodEndedForReconciliation allows from Sep 14", () => {
  assertPeriodEndedForReconciliation("2026-09-07", "2026-09-14");
});

Deno.test("clearPeriodFreeze archives seal and unfreezes", () => {
  const frozen = markPeriodFrozen(
    {},
    {
      actorId: "admin-1",
      reason: "week close",
      closeHash: "hash-abc",
      signedAt: "2026-09-07T10:00:00.000Z",
      sourceRowIds: ["s1"],
      engineVersion: "week-statement@1",
    },
  );
  assertEquals(isPeriodFrozen({ metadata: frozen }), true);

  const cleared = clearPeriodFreeze(
    { metadata: frozen },
    {
      actorId: "admin-2",
      reason: "mistaken close",
      reopenedAt: "2026-09-07T12:00:00.000Z",
    },
  );
  assertEquals(isPeriodFrozen({ metadata: cleared }), false);
  assertEquals(cleared.periodFrozen, false);
  assertEquals(cleared.signedWeek, false);
  const fc = cleared.financeCore as Record<string, unknown>;
  assertEquals(fc.periodFrozen, false);
  assertEquals(fc.signedAt, undefined);
  assertEquals(fc.closeHash, undefined);
  const history = fc.reopenHistory as Array<Record<string, unknown>>;
  assertEquals(history.length, 1);
  assertEquals(history[0].closeHash, "hash-abc");
  assertEquals(history[0].reopenedBy, "admin-2");
  assertEquals(history[0].reopenReason, "mistaken close");
});

Deno.test("clearPeriodFreeze appends reopenHistory on repeated reopen", () => {
  let meta = markPeriodFrozen(
    {},
    { actorId: "a", reason: "close1", closeHash: "h1", signedAt: "2026-09-01T00:00:00.000Z" },
  );
  meta = clearPeriodFreeze({ metadata: meta }, { actorId: "b", reason: "reopen1" });
  meta = markPeriodFrozen(
    { metadata: meta },
    { actorId: "a", reason: "close2", closeHash: "h2", signedAt: "2026-09-02T00:00:00.000Z" },
  );
  meta = clearPeriodFreeze({ metadata: meta }, { actorId: "c", reason: "reopen2" });
  const history = (meta.financeCore as Record<string, unknown>).reopenHistory as unknown[];
  assertEquals(history.length, 2);
});
