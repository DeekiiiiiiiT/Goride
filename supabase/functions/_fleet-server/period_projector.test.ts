import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { derivePeriodStatus } from "./period_projector.ts";

const clearTolls = {
  tollStatus: "n/a",
  tollWorkflowActionable: 0,
  tollUnmatchedCount: 0,
};

Deno.test("settled residual finalizes payout even when cash_still_held > 0 (share applied)", () => {
  const d = derivePeriodStatus({
    fuelFinalized: true,
    forceRelease: false,
    settled: { settlement: 0, adjCashBalance: 15785.22 },
    tolls: clearTolls,
  });
  assertEquals(d.settlementStatus, "settled");
  assertEquals(d.payoutStatus, "finalized");
  assertEquals(d.cashStillHeld, 15785.22);
  assertEquals(d.moneyUnlocked, true);
});

Deno.test("company_owes with cash held stays awaiting_cash until residual Pay", () => {
  const d = derivePeriodStatus({
    fuelFinalized: true,
    forceRelease: false,
    settled: { settlement: 8650.32, adjCashBalance: 15785.22 },
    tolls: clearTolls,
  });
  assertEquals(d.settlementStatus, "company_owes");
  assertEquals(d.payoutStatus, "awaiting_cash");
});

Deno.test("driver_owes with cash held stays awaiting_cash until residual Collect", () => {
  const d = derivePeriodStatus({
    fuelFinalized: true,
    forceRelease: false,
    settled: { settlement: -200, adjCashBalance: 500 },
    tolls: clearTolls,
  });
  assertEquals(d.settlementStatus, "driver_owes");
  assertEquals(d.payoutStatus, "awaiting_cash");
});

Deno.test("pre-unlock with cash held marks awaiting_cash", () => {
  const d = derivePeriodStatus({
    fuelFinalized: false,
    forceRelease: false,
    settled: { settlement: 100, adjCashBalance: 50 },
    tolls: clearTolls,
  });
  assertEquals(d.settlementStatus, "pending");
  assertEquals(d.payoutStatus, "awaiting_cash");
  assertEquals(d.moneyUnlocked, false);
});

Deno.test("unlocked settled with zero cash held is finalized", () => {
  const d = derivePeriodStatus({
    fuelFinalized: true,
    forceRelease: false,
    settled: { settlement: 0, adjCashBalance: 0 },
    tolls: clearTolls,
  });
  assertEquals(d.settlementStatus, "settled");
  assertEquals(d.payoutStatus, "finalized");
});
