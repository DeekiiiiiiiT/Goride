import { describe, it, expect, vi } from 'vitest';
import {
  finishBlockReason,
  runDeadheadCharge,
  runPersonalUseCharge,
  type ChargeTx,
  type ChargeTrip,
} from './tollChargeSagas';

const tx: ChargeTx = {
  id: 'toll-1',
  amount: -275,
  driverId: 'drv-1',
  date: '2026-09-10',
  description: 'Toll',
  paymentMethod: 'Other',
  isReconciled: false,
};

const trip: ChargeTrip = {
  id: 'trip-1',
  driverId: 'drv-1',
  date: '2026-09-10',
};

describe('finishBlockReason', () => {
  it('blocks Finish on loadError (TR-M5 / TR-H10a)', () => {
    expect(finishBlockReason({ loadError: 'network failed' })).toBe('load_error');
  });

  it('blocks Finish on truncation', () => {
    expect(finishBlockReason({ dataTruncated: true })).toBe('truncated');
  });

  it('blocks Finish on identity residual above $0.01', () => {
    expect(finishBlockReason({ identityResidual: 0.05 })).toBe('identity_residual');
  });

  it('allows Finish when clean', () => {
    expect(
      finishBlockReason({
        loadError: null,
        dataTruncated: false,
        identityResidual: 0,
        allPlatformActionable: 0,
      }),
    ).toBe(null);
  });
});

describe('runPersonalUseCharge rollback', () => {
  it('unreconciles when claim fails after trip link', async () => {
    const unreconcile = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const createClaim = vi.fn().mockRejectedValue(new Error('claim failed'));

    await expect(
      runPersonalUseCharge(
        tx,
        { trip, reason: 'personal' },
        {
          confirmChargeSyncOrAbort: async () => true,
          reconcile: vi.fn().mockResolvedValue(undefined),
          reject: vi.fn(),
          unreconcile,
          createClaim,
          refresh,
          refreshClaims: vi.fn(),
          nowIso: () => '2026-09-25T00:00:00.000Z',
        },
      ),
    ).rejects.toThrow('claim failed');

    expect(unreconcile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'toll-1', tripId: 'trip-1', isReconciled: true }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('refreshes without unreconcile when reject-path claim fails', async () => {
    const unreconcile = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(
      runPersonalUseCharge(
        tx,
        { reason: 'personal' },
        {
          confirmChargeSyncOrAbort: async () => true,
          reconcile: vi.fn(),
          reject: vi.fn().mockResolvedValue(undefined),
          unreconcile,
          createClaim: vi.fn().mockRejectedValue(new Error('claim failed')),
          refresh,
          refreshClaims: vi.fn(),
        },
      ),
    ).rejects.toThrow('claim failed');

    expect(unreconcile).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('cancels when charge sync confirm returns false', async () => {
    const onCancelled = vi.fn();
    const result = await runPersonalUseCharge(
      tx,
      { trip, reason: 'personal' },
      {
        confirmChargeSyncOrAbort: async () => false,
        reconcile: vi.fn(),
        reject: vi.fn(),
        unreconcile: vi.fn(),
        createClaim: vi.fn(),
        refresh: vi.fn(),
        refreshClaims: vi.fn(),
        onCancelled,
      },
    );
    expect(result).toBe('cancelled');
    expect(onCancelled).toHaveBeenCalled();
  });
});

describe('runDeadheadCharge rollback', () => {
  it('unreconciles when claim fails after reconcile', async () => {
    const unreconcile = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const result = await runDeadheadCharge(tx, trip, {
      confirmChargeSyncOrAbort: async () => true,
      reconcile: vi.fn().mockResolvedValue(undefined),
      unreconcile,
      createClaim: vi.fn().mockRejectedValue(new Error('claim failed')),
      refresh,
      refreshClaims: vi.fn(),
    });

    expect(result).toBe('failed');
    expect(unreconcile).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('calls onRollbackFailed when unreconcile also fails', async () => {
    const onRollbackFailed = vi.fn();
    const result = await runDeadheadCharge(tx, trip, {
      confirmChargeSyncOrAbort: async () => true,
      reconcile: vi.fn().mockResolvedValue(undefined),
      unreconcile: vi.fn().mockRejectedValue(new Error('unreconcile failed')),
      createClaim: vi.fn().mockRejectedValue(new Error('claim failed')),
      refresh: vi.fn(),
      refreshClaims: vi.fn(),
      onRollbackFailed,
    });
    expect(result).toBe('failed');
    expect(onRollbackFailed).toHaveBeenCalled();
  });
});
