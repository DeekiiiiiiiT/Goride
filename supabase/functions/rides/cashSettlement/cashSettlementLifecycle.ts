import type { RideStatus } from "../rideLifecycle.ts";

export type CashSettlementRideStatus = Extract<RideStatus, "on_trip" | "awaiting_cash_settlement" | "completed">;

export const CASH_SETTLEMENT_TRANSITIONS: Record<string, RideStatus[]> = {
  on_trip: ["awaiting_cash_settlement"],
  awaiting_cash_settlement: ["completed"],
};

export function canTransitionToCashSettlement(
  current: RideStatus,
  paymentMethod: string | null | undefined,
  cashSettlementEnabled: boolean,
): boolean {
  if (!cashSettlementEnabled) return false;
  if (current !== "on_trip") return false;
  return (paymentMethod ?? "cash") === "cash";
}

export function isAwaitingCashSettlement(status: string): boolean {
  return status === "awaiting_cash_settlement";
}

export function fareLockPatch(
  fareFinalMinor: number,
  nowIso: string,
): Record<string, unknown> {
  return {
    status: "awaiting_cash_settlement" as RideStatus,
    fare_final_minor: fareFinalMinor,
    fare_locked_at: nowIso,
    cash_settlement_status: "pending",
    updated_at: nowIso,
  };
}

export function settledRidePatch(
  computed: {
    outcome: string;
    cash_received_minor: number;
  },
  tipReceivedMinor: number,
  nowIso: string,
): Record<string, unknown> {
  return {
    status: "completed" as RideStatus,
    cash_received_minor: computed.cash_received_minor,
    tip_received_minor: tipReceivedMinor > 0 ? tipReceivedMinor : null,
    cash_settlement_status: "settled",
    cash_settlement_outcome: computed.outcome,
    settled_at: nowIso,
    completed_at: nowIso,
    updated_at: nowIso,
  };
}
