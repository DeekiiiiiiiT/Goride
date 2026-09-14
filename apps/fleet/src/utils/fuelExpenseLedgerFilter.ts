import { isFuelReimbursement, isLedgerFuelExpenseRow } from '@roam/fuel-core';

/** Row shape used by Ledgers › Fuel Expenses (R4). */
export type FuelExpenseLedgerTx = {
  type?: string;
  category?: string;
  description?: string;
  status?: string;
  paymentMethod?: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * Approved/Rejected fuel money rows that belong on the accounting home —
 * Expense-typed ledger lines OR reimbursement / manual claim types.
 */
export function isFuelExpenseLedgerVisibleRow(t: FuelExpenseLedgerTx): boolean {
  if (t.status !== 'Approved' && t.status !== 'Rejected') return false;
  return isFuelReimbursement(t) || isLedgerFuelExpenseRow(t);
}
