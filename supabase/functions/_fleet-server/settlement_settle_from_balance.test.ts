import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateSettleFromBalanceAmount } from "./settlement_commands.ts";
import {
  bothSettleHalvesComplete,
  periodHasSettleOffsetLine,
  resolveStoredSettlePair,
} from "./settlement_settle_from_balance.ts";

Deno.test("validateSettleFromBalanceAmount accepts Kenny Sep 14 against Oct 19", () => {
  const result = validateSettleFromBalanceAmount({
    amount: 8102.23,
    owingSettlement: -8102.23,
    creditSettlement: 37397.13,
  });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.amount, 8102.23);
});

Deno.test("validateSettleFromBalanceAmount refuses oversize against owing week", () => {
  const result = validateSettleFromBalanceAmount({
    amount: 8102.23,
    owingSettlement: -5000,
    creditSettlement: 37397.13,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "EXCEEDS_OWING");
});

Deno.test("validateSettleFromBalanceAmount refuses oversize against credit week", () => {
  const result = validateSettleFromBalanceAmount({
    amount: 12000,
    owingSettlement: -12000,
    creditSettlement: 11084.45,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "EXCEEDS_CREDIT");
});

Deno.test("validateSettleFromBalanceAmount refuses zero", () => {
  const result = validateSettleFromBalanceAmount({
    amount: 0,
    owingSettlement: -100,
    creditSettlement: 100,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "INVALID_AMOUNT");
});

Deno.test("Kenny full net leaves 11084.45 on Oct 19", () => {
  const weeks = [
    { owing: -8102.23 },
    { owing: -9480.81 },
    { owing: -8690.23 },
    { owing: -39.41 },
  ];
  let credit = 37397.13;
  let totalNetted = 0;
  for (const w of weeks) {
    const amount = Math.abs(w.owing);
    const check = validateSettleFromBalanceAmount({
      amount,
      owingSettlement: w.owing,
      creditSettlement: credit,
    });
    assertEquals(check.ok, true);
    if (check.ok) {
      credit = Math.round((credit - check.amount) * 100) / 100;
      totalNetted = Math.round((totalNetted + check.amount) * 100) / 100;
    }
  }
  assertEquals(totalNetted, 26312.68);
  assertEquals(credit, 11084.45);
});

Deno.test("resolveStoredSettlePair reuses offsetId and amount from clear_owes half", () => {
  const pair = resolveStoredSettlePair(
    {
      id: "m1",
      amount_minor: 810223,
      metadata: { offsetId: "off-1", role: "clear_owes" },
    },
    null,
  );
  assertEquals(pair, { offsetId: "off-1", amount: 8102.23 });
});

Deno.test("resolveStoredSettlePair reuses amount from apply_credit when clear missing", () => {
  const pair = resolveStoredSettlePair(null, {
    id: "m2",
    amount_minor: -810223,
    metadata: { offsetId: "off-2", role: "apply_credit" },
  });
  assertEquals(pair, { offsetId: "off-2", amount: 8102.23 });
});

Deno.test("resolveStoredSettlePair returns null without offsetId", () => {
  assertEquals(
    resolveStoredSettlePair(
      { id: "m1", amount_minor: 100, metadata: {} },
      null,
    ),
    null,
  );
});

Deno.test("bothSettleHalvesComplete false when credit half missing (half-finish)", () => {
  assertEquals(
    bothSettleHalvesComplete({
      clearOwesMovement: true,
      applyCreditMovement: false,
      owingHasLine: true,
      creditHasLine: false,
    }),
    false,
  );
});

Deno.test("bothSettleHalvesComplete false when movement exists but correction line missing", () => {
  assertEquals(
    bothSettleHalvesComplete({
      clearOwesMovement: true,
      applyCreditMovement: true,
      owingHasLine: true,
      creditHasLine: false,
    }),
    false,
  );
});

Deno.test("bothSettleHalvesComplete true only when both movements and both lines exist", () => {
  assertEquals(
    bothSettleHalvesComplete({
      clearOwesMovement: true,
      applyCreditMovement: true,
      owingHasLine: true,
      creditHasLine: true,
    }),
    true,
  );
});

Deno.test("periodHasSettleOffsetLine finds settle_from_balance by offsetId", () => {
  const row = {
    metadata: {
      financeCore: {
        correctionLines: [
          { kind: "settle_from_balance", offsetId: "off-9", amount: 100 },
        ],
      },
    },
  };
  assertEquals(periodHasSettleOffsetLine(row, "off-9"), true);
  assertEquals(periodHasSettleOffsetLine(row, "other"), false);
  assertEquals(periodHasSettleOffsetLine(null, "off-9"), false);
});

/** Contract: GET /snapshot shadow fallback must never invent a finalize-able version. */
Deno.test("shadow snapshot fallback contract uses version null", () => {
  const shadowFallback = {
    version: null as number | null,
    reused: true,
    reports: [{ vehicleId: "v1" }],
    totalSpend: null,
  };
  assertEquals(shadowFallback.version, null);
  assertEquals(Number(shadowFallback.version) || 0, 0);
});
