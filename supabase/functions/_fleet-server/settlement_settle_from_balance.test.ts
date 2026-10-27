import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateSettleFromBalanceAmount } from "./settlement_commands.ts";

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
