/**
 * Pure validation for admin cash settlement actions (testable, no I/O).
 */

export type AdminCashRide = {
  status: string;
  payment_method?: string | null;
};

export function isCashPaymentMethod(paymentMethod: string | null | undefined): boolean {
  return (paymentMethod ?? "cash") === "cash";
}

export function canAdminReleaseCashSettlement(
  ride: AdminCashRide,
  cashSettlementEnabled: boolean,
): { ok: true } | { ok: false; error: string; status: number } {
  if (!cashSettlementEnabled) {
    return { ok: false, error: "feature_disabled", status: 404 };
  }
  if (!isCashPaymentMethod(ride.payment_method)) {
    return { ok: false, error: "not_cash_trip", status: 409 };
  }
  if (ride.status !== "on_trip") {
    return {
      ok: false,
      error: "release_only_on_trip",
      status: 409,
    };
  }
  return { ok: true };
}

export function canAdminSettleCash(
  ride: AdminCashRide,
  cashSettlementEnabled: boolean,
): { ok: true } | { ok: false; error: string; status: number } {
  if (!cashSettlementEnabled) {
    return { ok: false, error: "feature_disabled", status: 404 };
  }
  if (!isCashPaymentMethod(ride.payment_method)) {
    return { ok: false, error: "not_cash_trip", status: 409 };
  }
  if (ride.status !== "awaiting_cash_settlement") {
    return {
      ok: false,
      error: "settle_only_awaiting_cash",
      status: 409,
    };
  }
  return { ok: true };
}

/** Cash trips must use release + settle endpoints instead of generic complete. */
export function shouldBlockCashForceComplete(
  ride: AdminCashRide,
  cashSettlementEnabled: boolean,
): boolean {
  return cashSettlementEnabled && isCashPaymentMethod(ride.payment_method);
}
