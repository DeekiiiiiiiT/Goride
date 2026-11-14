import type { SubmitCashTollPayload } from '../types/offline';

export type BuildCashTollQueueInput = {
  occurredAt: string;
  amountMinor: number;
  plaza?: string;
  lane?: string;
  collector?: string;
  vehicleClass?: string;
  receiptNumber?: string;
  notes?: string;
  merchant?: string;
  label?: string;
  receiptBlobKey: string;
  receiptFileName: string;
  receiptMimeType: string;
  listDateLabel: string;
};

/** Full offline queue payload for a cash toll (photo blob must already be stored). */
export function buildCashTollQueuePayload(input: BuildCashTollQueueInput): SubmitCashTollPayload {
  return {
    occurredAt: input.occurredAt,
    amountMinor: input.amountMinor,
    plazaName: input.plaza,
    lane: input.lane,
    collector: input.collector,
    vehicleClass: input.vehicleClass,
    receiptNumber: input.receiptNumber,
    notes: input.notes,
    merchant: input.merchant,
    label: input.label ?? `Toll — ${input.listDateLabel}`,
    receiptBlobKey: input.receiptBlobKey,
    receiptFileName: input.receiptFileName,
    receiptMimeType: input.receiptMimeType,
  };
}
