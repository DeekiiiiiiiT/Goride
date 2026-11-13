import type { SubmitCashTollPayload } from '../types/offline';
import type { FinancialTransaction } from '../types/data';

export type BuildCashTollQueueInput = {
  occurredAt: string;
  amountMinor: number;
  tollAmount: number;
  ymd: string;
  timeStr: string;
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
  canonicalDriverId?: string;
  canonicalDriverName?: string;
  userId?: string;
  resolvedVehicleId?: string;
  vehiclePlate?: string;
  listDateLabel: string;
};

function buildTollLegacyTransaction(input: BuildCashTollQueueInput): Record<string, unknown> {
  const description =
    input.notes ||
    `Tolls Expense - ${input.merchant && input.merchant !== 'Other' ? input.merchant : input.plaza || 'Toll'}`;
  const tx: Partial<FinancialTransaction> = {
    driverId: input.canonicalDriverId || input.userId,
    driverName: input.canonicalDriverName,
    vehicleId: input.resolvedVehicleId,
    vehiclePlate: input.vehiclePlate,
    date: input.ymd,
    time: input.timeStr,
    type: 'Expense',
    category: 'Tolls',
    description,
    status: 'Pending',
    notes: input.notes,
    vendor: input.merchant && input.merchant !== 'Other' ? input.merchant : '',
    referenceNumber: input.receiptNumber,
    amount: -Math.abs(input.tollAmount),
    paymentMethod: 'Cash',
    metadata: {
      plaza: input.plaza,
      lane: input.lane,
      vehicleClass: input.vehicleClass,
      collector: input.collector,
    } as FinancialTransaction['metadata'],
    receiptUrl: '',
  };
  return tx as Record<string, unknown>;
}

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
    legacyTransaction: buildTollLegacyTransaction(input),
  };
}
