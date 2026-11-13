import { describe, expect, it, vi } from 'vitest';
import { syncCashToll, isPermanentTollSyncError } from './syncCashToll';
import type { OfflineAction } from '../types/offline';

const baseAction = (overrides?: Partial<OfflineAction>): Extract<OfflineAction, { type: 'SUBMIT_CASH_TOLL' }> => ({
  id: 'queue-item-uuid',
  type: 'SUBMIT_CASH_TOLL',
  timestamp: Date.now(),
  retryCount: 0,
  payload: {
    occurredAt: '2024-06-10T12:00:00-05:00',
    amountMinor: 37000,
    plazaName: 'Main',
    receiptBlobKey: 'toll-receipt-queue-item-uuid',
    legacyTransaction: { category: 'Tolls', amount: -370 },
    ...((overrides as { payload?: object })?.payload),
  },
  ...overrides,
} as Extract<OfflineAction, { type: 'SUBMIT_CASH_TOLL' }>);

describe('syncCashToll', () => {
  it('200 removes item path returns done', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true as const });
    const removeBlob = vi.fn();
    const { offlineBlobStore } = await import('./offlineBlobStore');
    vi.spyOn(offlineBlobStore, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));

    const outcome = await syncCashToll(baseAction(), {
      uploadReceipt: async () => 'https://cdn/r.jpg',
      submitDriverCash: submit,
      saveLegacyTransaction: vi.fn(),
      removeBlob,
    });

    expect(outcome).toBe('done');
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ submission_id: 'queue-item-uuid' }));
    expect(removeBlob).toHaveBeenCalled();
  });

  it('TOLLS_V2_OFF falls back to saveTransaction with item id', async () => {
    const saveLegacy = vi.fn().mockResolvedValue(undefined);
    const { offlineBlobStore } = await import('./offlineBlobStore');
    vi.spyOn(offlineBlobStore, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));

    const outcome = await syncCashToll(baseAction(), {
      uploadReceipt: async () => 'https://cdn/r.jpg',
      submitDriverCash: async () => ({ ok: false, status: 409, code: 'TOLLS_V2_OFF' }),
      saveLegacyTransaction: saveLegacy,
      removeBlob: vi.fn(),
    });

    expect(outcome).toBe('legacy_done');
    expect(saveLegacy).toHaveBeenCalledWith(expect.objectContaining({ id: 'queue-item-uuid' }));
  });

  it('network error keeps item via retry', async () => {
    const { offlineBlobStore } = await import('./offlineBlobStore');
    vi.spyOn(offlineBlobStore, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));

    const submit = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const outcome = await syncCashToll(baseAction(), {
      uploadReceipt: async () => 'https://cdn/r.jpg',
      submitDriverCash: submit,
      saveLegacyTransaction: vi.fn(),
      removeBlob: vi.fn(),
    });
    expect(outcome).toBe('retry');
    expect(submit.mock.calls[0][0].submission_id).toBe('queue-item-uuid');
    const outcome2 = await syncCashToll(baseAction(), {
      uploadReceipt: async () => 'https://cdn/r.jpg',
      submitDriverCash: submit,
      saveLegacyTransaction: vi.fn(),
      removeBlob: vi.fn(),
    });
    expect(submit.mock.calls[1][0].submission_id).toBe('queue-item-uuid');
    expect(outcome2).toBe('retry');
  });

  it('missing photo is permanent and sends nothing', async () => {
    const submit = vi.fn();
    const saveLegacy = vi.fn();
    const { offlineBlobStore } = await import('./offlineBlobStore');
    vi.spyOn(offlineBlobStore, 'get').mockResolvedValue(null);

    await expect(
      syncCashToll(baseAction(), {
        uploadReceipt: async () => 'https://cdn/r.jpg',
        submitDriverCash: submit,
        saveLegacyTransaction: saveLegacy,
        removeBlob: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'MISSING_RECEIPT_PHONE', permanent: true });
    expect(submit).not.toHaveBeenCalled();
    expect(saveLegacy).not.toHaveBeenCalled();
    expect(isPermanentTollSyncError({ code: 'MISSING_RECEIPT_PHONE', permanent: true })).toBe(true);
  });

  it('missing receiptBlobKey is permanent', async () => {
    const submit = vi.fn();
    await expect(
      syncCashToll(
        baseAction({ payload: { receiptBlobKey: undefined } as never }),
        {
          uploadReceipt: async () => 'https://cdn/r.jpg',
          submitDriverCash: submit,
          saveLegacyTransaction: vi.fn(),
          removeBlob: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ code: 'MISSING_RECEIPT_PHONE', permanent: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it('NO_VEHICLE is permanent with code preserved', async () => {
    const { offlineBlobStore } = await import('./offlineBlobStore');
    vi.spyOn(offlineBlobStore, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));

    const err = await syncCashToll(baseAction(), {
      uploadReceipt: async () => 'https://cdn/r.jpg',
      submitDriverCash: async () => ({ ok: false, status: 400, code: 'NO_VEHICLE' }),
      saveLegacyTransaction: vi.fn(),
      removeBlob: vi.fn(),
    }).catch((e) => e);

    expect(err).toMatchObject({ code: 'NO_VEHICLE', status: 400, permanent: true });
    expect(isPermanentTollSyncError(err)).toBe(true);
  });
});
