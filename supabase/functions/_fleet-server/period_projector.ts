/**
 * Single projector for period status derivation (A-2).
 * Both full rebuild and cash sync call this — no duplicated status logic.
 */
import { STATUS_CASH_HELD_EPS, STATUS_SETTLED_EPS, round2 } from "../../../packages/finance-core/src/money.ts";
import type { PeriodSettlementResult } from "../../../packages/finance-core/src/driverPeriodSettlement.ts";

export type TollGateInput = {
  tollStatus: string;
  tollWorkflowActionable: number;
  tollUnmatchedCount: number;
};

export type PeriodStatusInput = {
  fuelFinalized: boolean;
  forceRelease: boolean;
  settled: Pick<PeriodSettlementResult, "settlement" | "adjCashBalance">;
  tolls: TollGateInput;
};

export type DerivedPeriodStatus = {
  settlementStatus: string;
  payoutStatus: string;
  periodStatus: "open" | "closed" | "reopened";
  cashStillHeld: number;
  moneyUnlocked: boolean;
  tollsClear: boolean;
};

export function tollsClearFromGate(tolls: TollGateInput): boolean {
  const tollStatus = String(tolls.tollStatus || "n/a");
  return (
    (tollStatus === "reconciled" || tollStatus === "n/a") &&
    Number(tolls.tollWorkflowActionable || 0) === 0 &&
    Number(tolls.tollUnmatchedCount || 0) === 0
  );
}

export function derivePeriodStatus(input: PeriodStatusInput): DerivedPeriodStatus {
  const tollsClear = tollsClearFromGate(input.tolls);
  const moneyUnlocked = (input.fuelFinalized && tollsClear) || input.forceRelease;
  const cashStillHeld = round2(Math.max(0, input.settled.adjCashBalance));
  const settlementAmount = input.settled.settlement;

  let settlementStatus = "pending";
  let payoutStatus = "pending";
  if (moneyUnlocked) {
    if (Math.abs(settlementAmount) < STATUS_SETTLED_EPS) settlementStatus = "settled";
    else if (settlementAmount > 0) settlementStatus = "company_owes";
    else settlementStatus = "driver_owes";
    payoutStatus = cashStillHeld > STATUS_CASH_HELD_EPS ? "awaiting_cash" : "finalized";
  } else if (input.fuelFinalized && !tollsClear) {
    payoutStatus = "awaiting_tolls";
  }

  const periodStatus: "open" | "closed" | "reopened" =
    Number(input.tolls.tollWorkflowActionable || 0) > 0 ||
    Number(input.tolls.tollUnmatchedCount || 0) > 0
      ? "open"
      : input.fuelFinalized && tollsClear
        ? "closed"
        : "open";

  return {
    settlementStatus,
    payoutStatus,
    periodStatus,
    cashStillHeld,
    moneyUnlocked,
    tollsClear,
  };
}
