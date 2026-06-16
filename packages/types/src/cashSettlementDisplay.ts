/**
 * Client-side cash settlement display helpers (mirrors server computeOutcome.ts).
 * Used by rider and driver apps — no journal or API side effects.
 */
import type {
  CashSettlementOutcome,
  CashSettlementSnapshotDto,
  DriverFacingSettlementOutcome,
  RideRequestRow,
  SettlementSummaryDto,
} from './rides';
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
  | 'cash_settlement_snapshot'
  | 'currency'
>;

export type RiderSettlementSummaryPick = Pick<
  SettlementSummaryDto,
  | 'cash_received_minor'
  | 'arrears_minor'
  | 'owed_minor'
  | 'change_credit_minor'
  | 'wallet_paid_minor'
  | 'rider_arrears_minor'
  | 'driver_digital_credit_minor'
>;

function walletPaidFromSnapshot(
  snapshot: CashSettlementSnapshotDto | null | undefined,
): number | null {
  if (snapshot?.wallet_paid_minor != null) {
    const n = Number(snapshot.wallet_paid_minor);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
}

export function isSplitPaymentOutcome(
  outcome: CashSettlementOutcome | null | undefined,
): boolean {
  return outcome === 'split';
}

function cashReceivedFromSnapshot(
  snapshot: CashSettlementSnapshotDto | null | undefined,
): number | null {
  if (snapshot?.cash_received_minor == null) return null;
  const n = Number(snapshot.cash_received_minor);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function arrearsFromSnapshot(
  snapshot: CashSettlementSnapshotDto | null | undefined,
): number | null {
  if (snapshot?.rider_arrears_minor != null) {
    const n = Number(snapshot.rider_arrears_minor);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  if (snapshot?.arrears_minor == null) return null;
  const n = Number(snapshot.arrears_minor);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/** Rider shortfall display: wallet + arrears must not exceed fare gap (handles duplicate journal). */
export function reconcileRiderShortfallDisplay(params: {
  owedMinor: number;
  cashReceivedMinor: number;
  walletPaidMinor: number;
  arrearsMinor: number;
}): { wallet_paid_minor: number; rider_arrears_minor: number } {
  const shortfall = Math.max(0, params.owedMinor - params.cashReceivedMinor);
  let walletPaid = Math.max(0, Math.floor(params.walletPaidMinor));
  let riderArrears = Math.max(0, Math.floor(params.arrearsMinor));

  if (shortfall <= 0) {
    return { wallet_paid_minor: 0, rider_arrears_minor: 0 };
  }

  if (walletPaid + riderArrears > shortfall) {
    if (walletPaid > 0) {
      riderArrears = Math.max(0, shortfall - walletPaid);
    } else {
      walletPaid = Math.max(0, shortfall - riderArrears);
    }
  }

  return { wallet_paid_minor: walletPaid, rider_arrears_minor: riderArrears };
}

/** Physical cash the rider handed the driver at settlement. */
export function resolveCashReceivedMinor(
  ride: CashSettlementRidePick,
  summary?: RiderSettlementSummaryPick | null,
): number {
  if (summary?.cash_received_minor != null && Number.isFinite(summary.cash_received_minor)) {
    return Math.max(0, Math.floor(summary.cash_received_minor));
  }

  const fromColumn =
    ride.cash_received_minor != null && Number.isFinite(Number(ride.cash_received_minor))
      ? Math.max(0, Math.floor(Number(ride.cash_received_minor)))
      : null;
  const fromSnapshot = cashReceivedFromSnapshot(ride.cash_settlement_snapshot);

  if (fromColumn != null && fromColumn > 0) return fromColumn;
  if (fromSnapshot != null && fromSnapshot > 0) return fromSnapshot;
  if (fromColumn != null) return fromColumn;
  if (fromSnapshot != null) return fromSnapshot;
  return 0;
}

/** Shortfall covered from the rider Roam wallet at settlement. */
export function resolveWalletPaidMinor(
  ride: CashSettlementRidePick,
  opts?: {
    summary?: RiderSettlementSummaryPick | null;
    receivedMinor?: number;
    owedMinor?: number;
    outcome?: CashSettlementOutcome | null;
  },
): number {
  const outcome = opts?.outcome ?? resolveCashSettlementOutcome(ride);
  const owed = opts?.owedMinor ?? resolveLockedFareMinor(ride) ?? 0;
  const received = opts?.receivedMinor ?? resolveCashReceivedMinor(ride, opts?.summary);

  if (opts?.summary?.wallet_paid_minor != null && opts.summary.wallet_paid_minor >= 0) {
    const fromSummary = Math.floor(opts.summary.wallet_paid_minor);
    if (fromSummary > 0) return fromSummary;
  }

  const fromSnapshot = walletPaidFromSnapshot(ride.cash_settlement_snapshot);
  if (fromSnapshot != null && fromSnapshot > 0) return fromSnapshot;

  if (outcome === 'split' || outcome === 'underpay') {
    const riderArrears = resolveRiderArrearsMinor(ride, {
      summary: opts?.summary,
      receivedMinor: received,
      owedMinor: owed,
      outcome,
    });
    const shortfall = Math.max(0, owed - received);
    return Math.max(0, shortfall - riderArrears);
  }

  return 0;
}

/** Amount the rider still owes Roam (company receivable), not the driver. */
export function resolveRiderArrearsMinor(
  ride: CashSettlementRidePick,
  opts?: {
    summary?: RiderSettlementSummaryPick | null;
    receivedMinor?: number;
    owedMinor?: number;
    outcome?: CashSettlementOutcome | null;
  },
): number {
  const owed = opts?.owedMinor ?? resolveLockedFareMinor(ride) ?? 0;
  const received = opts?.receivedMinor ?? resolveCashReceivedMinor(ride, opts?.summary);

  if (opts?.summary?.rider_arrears_minor != null && opts.summary.rider_arrears_minor >= 0) {
    return reconcileRiderShortfallDisplay({
      owedMinor: owed,
      cashReceivedMinor: received,
      walletPaidMinor: opts.summary.wallet_paid_minor ?? 0,
      arrearsMinor: opts.summary.rider_arrears_minor,
    }).rider_arrears_minor;
  }

  const snap = ride.cash_settlement_snapshot;
  const fromSnapshot = arrearsFromSnapshot(snap);
  const walletPaid =
    opts?.summary?.wallet_paid_minor ??
    walletPaidFromSnapshot(snap) ??
    0;

  if (fromSnapshot != null) {
    return reconcileRiderShortfallDisplay({
      owedMinor: owed,
      cashReceivedMinor: received,
      walletPaidMinor: walletPaid,
      arrearsMinor: fromSnapshot,
    }).rider_arrears_minor;
  }

  const outcome = opts?.outcome ?? resolveCashSettlementOutcome(ride);
  if (outcome === 'unpaid') {
    return Math.max(0, owed - received);
  }
  if (outcome === 'underpay' || outcome === 'split') {
    return reconcileRiderShortfallDisplay({
      owedMinor: owed,
      cashReceivedMinor: received,
      walletPaidMinor: walletPaid,
      arrearsMinor: Math.max(0, owed - received),
    }).rider_arrears_minor;
  }

  return 0;
}

export function resolveDriverDigitalCreditMinor(
  ride: CashSettlementRidePick,
  summary?: RiderSettlementSummaryPick | null,
): number {
  if (summary?.driver_digital_credit_minor != null && summary.driver_digital_credit_minor > 0) {
    return Math.floor(summary.driver_digital_credit_minor);
  }
  const snap = ride.cash_settlement_snapshot;
  if (snap?.driver_digital_credit_minor != null && snap.driver_digital_credit_minor > 0) {
    return Math.floor(snap.driver_digital_credit_minor);
  }
  const outcome = resolveCashSettlementOutcome(ride);
  if (outcome === 'split') {
    const owed = resolveLockedFareMinor(ride) ?? 0;
    const received = resolveCashReceivedMinor(ride, summary);
    return Math.max(0, owed - received);
  }
  return resolveWalletPaidMinor(ride, { summary, outcome });
}

/** Driver UI bucket — never implies rider owes driver. */
export function resolveDriverFacingOutcome(
  storedOutcome: CashSettlementOutcome | null | undefined,
  walletPaidMinor = 0,
): DriverFacingSettlementOutcome {
  if (!storedOutcome || storedOutcome === 'exact' || storedOutcome === 'split') return 'paid';
  if (storedOutcome === 'overpay') return 'change_due';
  if (storedOutcome === 'underpay' && walletPaidMinor > 0) return 'paid';
  if (storedOutcome === 'underpay') return 'paid';
  if (storedOutcome === 'unpaid') return 'ops_unpaid';
  return 'paid';
}

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

  const received = resolveCashReceivedMinor(ride, null);
  if (ride.cash_settlement_outcome && ride.status === 'completed') {
    const computed = computeCashSettlementOutcome(owed, received);
    return { ...computed, outcome: ride.cash_settlement_outcome };
  }

  if (ride.status === 'awaiting_cash_settlement') {
    return null;
  }

  if (ride.status === 'completed' && (ride.cash_received_minor != null || ride.cash_settlement_snapshot)) {
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
  if (outcome === 'split') return 'summary_paid';
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
    case 'split':
      return 'Trip paid with cash and your Roam wallet — thanks for riding with Roam';
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
    case 'split':
      return 'Trip paid';
    case 'unpaid':
      return 'Trip marked unpaid';
    default:
      return 'Trip completed';
  }
}
