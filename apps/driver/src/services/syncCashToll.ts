import type { OfflineAction } from '../types/offline';
import { offlineBlobStore } from './offlineBlobStore';

export type TollSyncError = Error & {
  status?: number;
  code?: string;
  permanent?: boolean;
};

export function tollSyncPermanentMessage(code?: string, fallback?: string): string {
  switch (code) {
    case 'MISSING_RECEIPT_PHONE':
      return 'The receipt photo is missing on this phone. Delete this toll and add it again.';
    case 'NO_VEHICLE':
      return "This toll couldn't be sent: no vehicle is assigned to you. Ask your fleet manager.";
    case 'DRIVER_NOT_FOUND':
      return "This toll couldn't be sent: your driver profile wasn't found. Ask your fleet manager.";
    case 'RECEIPT_REQUIRED':
      return "This toll couldn't be sent: receipt photo didn't upload. Delete this toll and add it again.";
    default:
      return fallback || "This toll couldn't be sent. Delete it and add it again.";
  }
}

export function isPermanentTollSyncError(e: unknown): boolean {
  const err = e as TollSyncError;
  if (err?.permanent === true) return true;
  const code = String(err?.code || '');
  if (code === 'MISSING_RECEIPT_PHONE') return true;
  if (['RECEIPT_REQUIRED', 'NO_VEHICLE', 'DRIVER_NOT_FOUND'].includes(code)) return true;
  if (err?.status === 400) return true;
  return false;
}

function makePermanentError(message: string, code: string): TollSyncError {
  const err = new Error(message) as TollSyncError;
  err.code = code;
  err.permanent = true;
  return err;
}

export type SyncCashTollDeps = {
  uploadReceipt: (file: File, sourceId: string) => Promise<string>;
  submitDriverCash: (
    body: Record<string, unknown>,
  ) => Promise<
    | { ok: true }
    | { ok: false; status: number; code?: string }
  >;
  saveLegacyTransaction: (tx: Record<string, unknown>) => Promise<void>;
  removeBlob: (key?: string) => Promise<void>;
};

export async function syncCashToll(
  action: Extract<OfflineAction, { type: 'SUBMIT_CASH_TOLL' }>,
  deps: SyncCashTollDeps,
): Promise<'done' | 'retry' | 'legacy_done'> {
  const { payload } = action;
  const submissionId = action.id;

  const blobKey = payload.receiptBlobKey?.trim();
  if (!blobKey) {
    throw makePermanentError(tollSyncPermanentMessage('MISSING_RECEIPT_PHONE'), 'MISSING_RECEIPT_PHONE');
  }
  const blob = await offlineBlobStore.get(blobKey);
  if (!blob) {
    throw makePermanentError(tollSyncPermanentMessage('MISSING_RECEIPT_PHONE'), 'MISSING_RECEIPT_PHONE');
  }

  const file = new File(
    [blob],
    payload.receiptFileName || 'toll-receipt.jpg',
    { type: payload.receiptMimeType || blob.type || 'image/jpeg' },
  );
  const receiptUrl = (await deps.uploadReceipt(file, submissionId)).trim();
  if (!receiptUrl) {
    throw makePermanentError(tollSyncPermanentMessage('RECEIPT_REQUIRED'), 'RECEIPT_REQUIRED');
  }

  const result = await deps.submitDriverCash({
    submission_id: submissionId,
    receipt_url: receiptUrl,
    receipt_number: payload.receiptNumber,
    occurred_at: payload.occurredAt,
    amount_minor: payload.amountMinor,
    plaza_name: payload.plazaName,
    lane: payload.lane,
    collector: payload.collector,
    vehicle_class: payload.vehicleClass,
  });

  if (result.ok) {
    await deps.removeBlob(payload.receiptBlobKey);
    return 'done';
  }

  if (result.status === 409 && result.code === 'TOLLS_V2_OFF') {
    const tx = {
      ...(payload.legacyTransaction || {}),
      id: submissionId,
      receiptUrl,
    };
    await deps.saveLegacyTransaction(tx);
    await deps.removeBlob(payload.receiptBlobKey);
    return 'legacy_done';
  }

  if (result.status === 400) {
    const code = result.code || 'BAD_REQUEST';
    throw Object.assign(new Error(tollSyncPermanentMessage(code)), {
      status: 400,
      code,
      permanent: true,
    }) as TollSyncError;
  }

  return 'retry';
}
