/**
 * TR-H10a: money charge sagas extracted from ReconciliationWizard for unit tests.
 * Wizard stays a thin caller — rollback behaviour lives here.
 *
 * TR-H10b: ChargeTx/ChargeTrip are Picks of the real domain types; deps are
 * generic + Promise<unknown> so FinancialTransaction/Trip handlers type-check
 * (param contravariance) without adapters.
 */

import type { FinancialTransaction, Trip } from '../types/data';

export type ChargeTx = Pick<
  FinancialTransaction,
  'id' | 'amount' | 'date' | 'description' | 'paymentMethod' | 'isReconciled'
> &
  Partial<
    Pick<
      FinancialTransaction,
      'driverId' | 'driverName' | 'vehicleId' | 'receiptUrl' | 'tripId'
    >
  >;

export type ChargeTrip = Pick<Trip, 'id'> &
  Partial<
    Pick<
      Trip,
      | 'driverId'
      | 'driverName'
      | 'requestTime'
      | 'date'
      | 'pickupLocation'
      | 'dropoffLocation'
      | 'platform'
    >
  >;

export type ClaimPayload = Record<string, unknown>;

export type PersonalChargeDeps<
  TTx extends ChargeTx = ChargeTx,
  TTrip extends ChargeTrip = ChargeTrip,
> = {
  confirmChargeSyncOrAbort: () => Promise<boolean>;
  reconcile: (tx: TTx, trip: TTrip) => Promise<unknown>;
  reject: (tx: TTx, reason: string) => Promise<unknown>;
  unreconcile: (tx: TTx & { tripId?: string; isReconciled?: boolean }) => Promise<unknown>;
  createClaim: (payload: ClaimPayload) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  refreshClaims: () => Promise<unknown>;
  onCancelled?: () => void;
  onNeedDriver?: (tx: TTx) => void;
  onSuccess?: (msg: string) => void;
  onError?: (err: unknown) => void;
  nowIso?: () => string;
};

export type DeadheadChargeDeps<
  TTx extends ChargeTx = ChargeTx,
  TTrip extends ChargeTrip = ChargeTrip,
> = {
  confirmChargeSyncOrAbort: () => Promise<boolean>;
  reconcile: (tx: TTx, trip: TTrip) => Promise<unknown>;
  unreconcile: (tx: TTx & { tripId?: string; isReconciled?: boolean }) => Promise<unknown>;
  createClaim: (payload: ClaimPayload) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  refreshClaims: () => Promise<unknown>;
  onCancelled?: () => void;
  onNoDriver?: () => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
  onRollbackFailed?: (originalErr: unknown) => void;
  nowIso?: () => string;
};

export type FinishBlockReason =
  | 'load_error'
  | 'truncated'
  | 'identity_residual'
  | 'cross_platform_actionable'
  | null;

/** Pure Finish gate — same rules as wizard handleFinish early returns. */
export function finishBlockReason(input: {
  loadError?: string | null;
  dataTruncated?: boolean;
  platformFilter?: string;
  identityResidual?: number | null;
  allPlatformActionable?: number;
}): FinishBlockReason {
  if (input.loadError) return 'load_error';
  if (input.dataTruncated) return 'truncated';
  if (
    (input.platformFilter ?? 'all') === 'all' &&
    input.identityResidual != null &&
    Math.abs(input.identityResidual) > 0.01
  ) {
    return 'identity_residual';
  }
  if ((input.allPlatformActionable ?? 0) > 0) return 'cross_platform_actionable';
  return null;
}

export async function runPersonalUseCharge<
  TTx extends ChargeTx,
  TTrip extends ChargeTrip,
>(
  tx: TTx,
  opts: {
    trip?: TTrip;
    reason: string;
    subject?: string;
    message?: string;
  },
  deps: PersonalChargeDeps<TTx, TTrip>,
): Promise<'ok' | 'cancelled' | 'need_driver'> {
  const resolvedDriverId = opts.trip?.driverId || tx.driverId;
  if (!resolvedDriverId) {
    deps.onNeedDriver?.(tx);
    return 'need_driver';
  }
  if (!(await deps.confirmChargeSyncOrAbort())) {
    deps.onCancelled?.();
    return 'cancelled';
  }

  const tollCost = Math.abs(tx.amount);
  const isCashClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
  let linkedOrRejected = false;
  try {
    try {
      if (opts.trip?.id) {
        await deps.reconcile(tx, opts.trip);
        linkedOrRejected = true;
      } else {
        await deps.reject(tx, opts.reason);
        linkedOrRejected = true;
      }
      await deps.createClaim({
        transactionId: tx.id,
        driverId: resolvedDriverId,
        amount: tollCost,
        expectedAmount: tollCost,
        paidAmount: 0,
        status: 'Resolved',
        type: 'Toll_Refund',
        resolutionReason: 'Charge Driver',
        subject: opts.subject || (isCashClaim
          ? 'Cash Personal Toll - Charged to Driver'
          : 'Unmatched Toll - Personal Use'),
        message: opts.message || (isCashClaim
          ? 'Driver used trip cash for a personal toll — charged to driver (no reimbursement).'
          : 'This toll was identified as personal usage and charged to your account.'),
        tripId: opts.trip?.id,
        tripDate: opts.trip?.requestTime || opts.trip?.date,
        pickup: opts.trip?.pickupLocation || tx.description || undefined,
        dropoff: opts.trip?.dropoffLocation,
        platform: opts.trip?.platform,
        vehicleId: tx.vehicleId,
        driverName: opts.trip?.driverName || tx.driverName,
        createdAt: (deps.nowIso ?? (() => new Date().toISOString()))(),
        updatedAt: (deps.nowIso ?? (() => new Date().toISOString()))(),
        date: tx.date,
      });
      await Promise.all([deps.refresh(), deps.refreshClaims()]);
      deps.onSuccess?.(
        isCashClaim
          ? 'Cash personal toll charged to driver'
          : opts.trip?.id
            ? 'Linked to trip & charged to driver'
            : 'Marked as personal (driver liability)',
      );
      return 'ok';
    } catch (error) {
      // Charge failed after queue mutation — put the toll back so the step stays open.
      if (linkedOrRejected && opts.trip?.id) {
        try {
          await deps.unreconcile({ ...tx, tripId: opts.trip.id, isReconciled: true });
          await deps.refresh();
        } catch (rollbackErr) {
          console.error('Personal charge rollback failed', rollbackErr);
        }
      } else if (linkedOrRejected) {
        await deps.refresh();
      }
      throw error;
    }
  } catch (error) {
    deps.onError?.(error);
    throw error;
  }
}

export async function runDeadheadCharge<
  TTx extends ChargeTx,
  TTrip extends ChargeTrip,
>(
  tx: TTx,
  trip: TTrip,
  deps: DeadheadChargeDeps<TTx, TTrip>,
): Promise<'ok' | 'cancelled' | 'no_driver' | 'failed'> {
  const driverId = trip.driverId || tx.driverId;
  if (!driverId) {
    deps.onNoDriver?.();
    return 'no_driver';
  }
  if (!(await deps.confirmChargeSyncOrAbort())) {
    deps.onCancelled?.();
    return 'cancelled';
  }

  let linked = false;
  try {
    await deps.reconcile(tx, trip);
    linked = true;
    const tollCost = Math.abs(tx.amount);
    await deps.createClaim({
      transactionId: tx.id,
      driverId,
      amount: tollCost,
      expectedAmount: tollCost,
      paidAmount: 0,
      status: 'Resolved',
      type: 'Toll_Refund',
      resolutionReason: 'Charge Driver',
      subject: 'Deadhead Toll - Charged to Driver',
      message: `Enroute-to-pickup toll charged to driver for trip ${trip.id}.`,
      tripId: trip.id,
      tripDate: trip.requestTime || trip.date,
      pickup: trip.pickupLocation,
      dropoff: trip.dropoffLocation,
      platform: trip.platform,
      vehicleId: tx.vehicleId,
      driverName: trip.driverName || tx.driverName,
      createdAt: (deps.nowIso ?? (() => new Date().toISOString()))(),
      updatedAt: (deps.nowIso ?? (() => new Date().toISOString()))(),
      date: tx.date,
    });
    await Promise.all([deps.refresh(), deps.refreshClaims()]);
    deps.onSuccess?.();
    return 'ok';
  } catch (e) {
    console.error(e);
    if (linked) {
      try {
        await deps.unreconcile({ ...tx, tripId: trip.id, isReconciled: true });
        await deps.refresh();
      } catch (rollbackErr) {
        console.error('Deadhead charge rollback failed', rollbackErr);
        deps.onRollbackFailed?.(e);
        return 'failed';
      }
    }
    deps.onError?.(e);
    return 'failed';
  }
}
