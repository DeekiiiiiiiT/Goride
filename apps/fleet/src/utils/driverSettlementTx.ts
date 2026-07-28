/**
 * Shared Cash Collection / Driver Payout transaction builders for
 * Cash Wallet + Driver Settlements desk (same Ledger types).
 */
import type { FinancialTransaction } from '../types/data';

export type CashCollectionSaveInput = {
  id?: string;
  amount: number;
  date: string;
  notes?: string;
  paymentMethod: string;
  referenceNumber?: string;
  transactionType: 'payment' | 'float' | 'adjustment';
  workPeriodStart?: string;
  workPeriodEnd?: string;
};

export type DriverPayoutSaveInput = {
  amount: number;
  date: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  workPeriodStart: string;
  workPeriodEnd: string;
};

/** Map Log Cash modal payload → wallet transaction (Payment_Received / float / adjustment). */
export function buildCashCollectionTx(
  input: CashCollectionSaveInput,
  ctx: { driverId: string; driverName: string },
): Partial<FinancialTransaction> {
  let category = 'Cash Collection';
  let type: FinancialTransaction['type'] = 'Payment_Received';
  let amount = Math.abs(input.amount);

  if (input.transactionType === 'float') {
    category = 'Float Issue';
    type = 'Float_Given';
    amount = -Math.abs(input.amount);
  } else if (input.transactionType === 'adjustment') {
    category = 'Adjustment';
    type = 'Adjustment';
    amount = Math.abs(input.amount);
  } else {
    category = 'Cash Collection';
    type = 'Payment_Received';
    amount = Math.abs(input.amount);
  }

  if (input.transactionType === 'payment' && (!input.workPeriodStart || !input.workPeriodEnd)) {
    throw new Error('Settlement Week is required for cash payments');
  }

  const isCash = input.paymentMethod === 'Cash';
  const isIncomingPayment = input.transactionType === 'payment';
  const initialStatus = isIncomingPayment && !isCash ? 'Pending' : 'Completed';

  const metadata: Record<string, string> = {};
  if (input.workPeriodStart && input.workPeriodEnd) {
    metadata.workPeriodStart = String(input.workPeriodStart).slice(0, 10);
    // Log Cash modal may pass noon-UTC ISO — normalize to ymd for SSOT tags
    if (String(input.workPeriodStart).includes('T')) {
      metadata.workPeriodStart = String(input.workPeriodStart).slice(0, 10);
    }
    metadata.workPeriodEnd = String(input.workPeriodEnd).includes('T')
      ? String(input.workPeriodEnd).slice(0, 10)
      : String(input.workPeriodEnd).slice(0, 10);
  }

  return {
    ...(input.id ? { id: input.id } : {}),
    driverId: ctx.driverId,
    driverName: ctx.driverName,
    amount,
    date: input.date,
    description:
      input.notes ||
      (input.transactionType === 'float' ? 'Cash Float Issued' : 'Cash Payment from Driver'),
    category,
    type,
    paymentMethod: input.paymentMethod as FinancialTransaction['paymentMethod'],
    referenceNumber: input.referenceNumber,
    status: initialStatus as FinancialTransaction['status'],
    isReconciled: initialStatus === 'Completed',
    time: new Date().toLocaleTimeString(),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/** Map Record Payout payload → Driver Payouts transaction. */
export function buildDriverPayoutTx(
  input: DriverPayoutSaveInput,
  ctx: { driverId: string; driverName: string },
): Partial<FinancialTransaction> {
  if (!input.workPeriodStart || !input.workPeriodEnd) {
    throw new Error('Settlement Week is required for driver payouts');
  }
  const amount = Math.abs(input.amount);
  if (!(amount > 0.005)) {
    throw new Error('Payout amount must be greater than zero');
  }
  const pm = input.paymentMethod || 'Cash';
  const isInstant = pm === 'Cash';
  return {
    driverId: ctx.driverId,
    driverName: ctx.driverName,
    amount,
    date: input.date,
    description: input.notes
      ? `Driver payout (${pm}): ${input.notes}`
      : `Driver payout via ${pm}`,
    category: 'Driver Payouts',
    type: 'Payout',
    paymentMethod: pm as FinancialTransaction['paymentMethod'],
    status: isInstant ? 'Completed' : 'Pending',
    isReconciled: isInstant,
    referenceNumber: input.referenceNumber,
    time: new Date().toLocaleTimeString(),
    metadata: {
      workPeriodStart: String(input.workPeriodStart).slice(0, 10),
      workPeriodEnd: String(input.workPeriodEnd).slice(0, 10),
    },
  };
}
