export type NativeTollMoment = "awaiting_cash" | "completed";
export type NativeTollCallKind = "ride_charge" | "cash_settled";

const KNOWN_CASH_OUTCOMES = new Set(["exact", "overpay", "underpay", "unpaid"]);

export interface RideTollCrossingRow {
  id: string;
  toll_plaza_id?: string | null;
  toll_amount_minor?: number | null;
  crossed_at?: string | null;
}

/** Same eligibility as nativeTollCallsFor (any moment); used to decide legacy skip vs v2 hook. */
export function rideRecordedByTollV2(ride: Record<string, unknown>): boolean {
  const orgId = ride.organization_id;
  if (!orgId || String(orgId).trim() === "") return false;
  if (String(ride.attribution_mode ?? "") !== "fleet") return false;

  const payment = ride.payment_method;
  if (payment == null || payment === "") return false;
  const method = String(payment);
  return method === "cash" || method === "card";
}

export function buildNativeRideCharge(
  ride: Record<string, unknown>,
  crossings: RideTollCrossingRow[],
  vehicleId: string | null | undefined,
): Record<string, unknown> {
  const breakdown = (ride.fare_breakdown ?? {}) as Record<string, unknown>;
  const endedAt = ride.completed_at ?? ride.dropoff_arrived_at ?? ride.fare_locked_at ??
    new Date().toISOString();

  return {
    ride_id: ride.id,
    payment_method: ride.payment_method,
    driver_id: ride.assigned_driver_user_id,
    vehicle_id: vehicleId ?? null,
    ended_at: endedAt,
    estimated_tolls_minor: Number(breakdown.estimated_tolls_minor ?? 0),
    crossings: crossings.map((c) => ({
      id: c.id,
      plaza_id: c.toll_plaza_id,
      amount_minor: c.toll_amount_minor,
      crossed_at: c.crossed_at,
    })),
  };
}

export function mapCashOutcome(ride: Record<string, unknown>): string {
  const raw = ride.cash_settlement_outcome;
  if (raw != null && raw !== "" && KNOWN_CASH_OUTCOMES.has(String(raw))) {
    return String(raw);
  }

  if (String(raw) === "split") {
    const riderArrears = Number(
      ride.rider_arrears_minor ?? ride.cash_settlement_rider_arrears_minor ?? NaN,
    );
    const fareFinal = Number(ride.fare_final_minor ?? 0);
    const cashReceived = Number(ride.cash_received_minor ?? 0);
    const walletPaid = Number(ride.wallet_paid_minor ?? 0);
    const platformGuarantee = Number(ride.platform_guarantee_minor ?? 0);
    const driverDigital = Number(ride.driver_digital_credit_minor ?? 0);

    if (Number.isFinite(riderArrears) && riderArrears === 0) {
      return "exact";
    }
    const totalTowardFare = cashReceived + walletPaid + platformGuarantee + driverDigital;
    if (totalTowardFare > 0 && fareFinal > 0) {
      return totalTowardFare >= fareFinal ? "exact" : "underpay";
    }
    return cashReceived >= fareFinal ? "exact" : "underpay";
  }

  if (raw == null || raw === "" || !KNOWN_CASH_OUTCOMES.has(String(raw))) {
    if (String(ride.cash_settlement_status ?? "") === "settled") {
      return "exact";
    }
    return "underpay";
  }

  const cashReceived = Number(ride.cash_received_minor ?? ride.fare_final_minor ?? 0);
  const fareFinal = Number(ride.fare_final_minor ?? 0);
  return cashReceived >= fareFinal ? "exact" : "underpay";
}

export function buildNativeCashSettled(ride: Record<string, unknown>): Record<string, unknown> {
  const breakdown = (ride.fare_breakdown ?? {}) as Record<string, unknown>;
  const settledAt = ride.settled_at ?? ride.completed_at ?? new Date().toISOString();

  return {
    ride_id: ride.id,
    outcome: mapCashOutcome(ride),
    cash_received_minor: ride.cash_received_minor ?? ride.fare_final_minor ?? 0,
    estimated_tolls_minor: Number(breakdown.estimated_tolls_minor ?? 0),
    driver_id: ride.assigned_driver_user_id,
    settled_at: settledAt,
  };
}

export function nativeTollCallsFor(
  ride: Record<string, unknown>,
  moment: NativeTollMoment,
): NativeTollCallKind[] {
  if (!rideRecordedByTollV2(ride)) return [];

  const method = String(ride.payment_method);

  if (moment === "awaiting_cash") {
    return method === "cash" ? ["ride_charge"] : [];
  }

  if (moment === "completed") {
    if (method === "card") return ["ride_charge"];
    if (method === "cash") {
      const calls: NativeTollCallKind[] = ["ride_charge"];
      if (String(ride.cash_settlement_status ?? "") === "settled") {
        calls.push("cash_settled");
      }
      return calls;
    }
  }

  return [];
}
