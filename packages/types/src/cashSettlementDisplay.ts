/**
 * Client-side cash settlement display helpers (mirrors server computeOutcome.ts).
 * Used by rider and driver apps — no journal or API side effects.
 */
import type { CashSettlementOutcome, RideRequestRow } from './rides';
import { formatMoneyMinor } from './rides';

export type CashPaymentCardMode =
  | 'hidden'
  | 'awaiting_payment'
  | 'settlement_result'
  | 'summary_arrears'
  | 'summary_paid';

export interface CashSettlementComputed {
  outcome: CashSettlementOutcome;
  owed_minor: number;
  cash_received_minor: number;
  arrears_minor: number;
  change_credit_minor: number;
}

export type CashSettlementRidePick = Pick<
  RideRequestRow,
  | 'payment_method'
  | 'status'
  | 'fare_final_minor'
  | 'fare_estimate_minor'
  | 'cash_received_minor'
  | 'cash_settlement_outcome'
  | 'currency'
>;

export function isCashRide(
  ride: Pick<RideRequestRow, 'payment_method'> | null | undefined,
): boolean {
  return (ride?.payment_method ?? 'cash') === 'cash';
}

export function resolveLockedFareMinor(ride: CashSettlementRidePick): number | null {
  const locked = Number(ride.fare_final_minor);
  if (Number.isFinite(locked) && locked >= 0) return locked;
  if (ride.status === 'on_trip') return null;
  const estimate = Number(ride.fare_estimate_minor);
  if (Number.isFinite(estimate) && estimate >= 0) return estimate;
  return null;
}

export function computeCashSettlementOutcome(
  owedMinor: number,
  receivedMinor: number,
): CashSettlementComputed {
  const owed = Math.max(0, Math.floor(Number(owedMinor) || 0));
  const received = Math.max(0, Math.floor(Number(receivedMinor) || 0));
  const delta = received - owed;

  if (received === 0 && owed > 0) {
    return {
      outcome: 'unpaid',
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: owed,
      change_credit_minor: 0,
    };
  }

  if (delta === 0) {
    return {
      outcome: 'exact',
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: 0,
      change_credit_minor: 0,
    };
  }

  if (delta < 0) {
    return {
      outcome: 'underpay',
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: -delta,
      change_credit_minor: 0,
    };
  }

  return {
    outcome: 'overpay',
    owed_minor: owed,
    cash_received_minor: received,
    arrears_minor: 0,
    change_credit_minor: delta,
  };
}

/** Derive settlement numbers from a ride row (completed or in-flight settlement). */
export function computeOutcomeFromRide(ride: CashSettlementRidePick): CashSettlementComputed | null {
  if (!isCashRide(ride)) return null;
  const owed = resolveLockedFareMinor(ride);
  if (owed == null) return null;

  const received = Number(ride.cash_received_minor ?? 0);
  if (ride.cash_settlement_outcome && ride.status === 'completed') {
    const computed = computeCashSettlementOutcome(owed, received);
    return { ...computed, outcome: ride.cash_settlement_outcome };
  }

  if (ride.status === 'awaiting_cash_settlement') {
    return null;
  }

  if (ride.status === 'completed' && ride.cash_received_minor != null) {
    return computeCashSettlementOutcome(owed, received);
  }

  return null;
}

export function getCashPaymentCardMode(ride: CashSettlementRidePick): CashPaymentCardMode {
  if (!isCashRide(ride)) return 'hidden';

  if (ride.status === 'on_trip') return 'hidden';

  if (ride.status === 'awaiting_cash_settlement') {
    return resolveLockedFareMinor(ride) != null ? 'awaiting_payment' : 'hidden';
  }

  if (ride.status !== 'completed') return 'hidden';

  const outcome = ride.cash_settlement_outcome;
  if (!outcome) return 'hidden';

  if (outcome === 'underpay' || outcome === 'unpaid') return 'summary_arrears';
  return 'summary_paid';
}

/** Whether to show settlement result on the rider drop-off / settlement screen (not summary). */
export function showSettlementResultOnTripScreen(outcome: CashSettlementOutcome | null | undefined): boolean {
  return outcome === 'exact' || outcome === 'overpay';
}

/** Completed cash trips use the dedicated cash trip summary (not the digital/card layout). */
export function shouldShowRiderCashTripSummary(
  ride: Pick<CashSettlementRidePick, 'payment_method' | 'status'> | null | undefined,
): boolean {
  return Boolean(ride && ride.status === 'completed' && isCashRide(ride));
}

/** Resolve settlement outcome from ride row or derived fare/received amounts. */
export function resolveCashSettlementOutcome(
  ride: CashSettlementRidePick,
): CashSettlementOutcome | null {
  if (ride.cash_settlement_outcome) return ride.cash_settlement_outcome;
  return computeOutcomeFromRide(ride)?.outcome ?? null;
}

export function cashSettlementOutcomeMessage(
  outcome: CashSettlementOutcome,
  ride: CashSettlementRidePick,
): string {
  const currency = ride.currency ?? 'JMD';
  const computed = computeOutcomeFromRide(ride);

  switch (outcome) {
    case 'exact':
      return 'Payment confirmed — thanks for riding with Roam';
    case 'underpay':
      return computed && computed.arrears_minor > 0
        ? `Payment recorded. You owe ${formatMoneyMinor(computed.arrears_minor, currency)} on your wallet.`
        : 'Payment recorded. You have an outstanding balance on your wallet.';
    case 'overpay': {
      const credit = computed?.change_credit_minor ?? 0;
      return credit > 0
        ? `${formatMoneyMinor(credit, currency)} credit added to your wallet`
        : 'Payment confirmed — change credited to your wallet';
    }
    case 'unpaid':
      return computed && computed.arrears_minor > 0
        ? `Trip marked unpaid — please settle ${formatMoneyMinor(computed.arrears_minor, currency)} in Wallet`
        : 'Trip marked unpaid — please settle your balance in Wallet';
    default:
      return 'Trip completed';
  }
}

export function cashSettlementResultHeadline(outcome: CashSettlementOutcome): string {
  switch (outcome) {
    case 'exact':
      return 'Payment confirmed';
    case 'overpay':
      return 'Change credited to your wallet';
    case 'underpay':
      return 'Partial payment recorded';
    case 'unpaid':
      return 'Trip marked unpaid';
    default:
      return 'Trip completed';
  }
}
