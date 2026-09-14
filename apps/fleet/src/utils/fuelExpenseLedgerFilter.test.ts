import { describe, expect, it } from 'vitest';
import { isFuelExpenseLedgerVisibleRow } from './fuelExpenseLedgerFilter';

describe('isFuelExpenseLedgerVisibleRow', () => {
  it('includes Approved Expense fuel rows', () => {
    expect(
      isFuelExpenseLedgerVisibleRow({
        type: 'Expense',
        category: 'Fuel',
        status: 'Approved',
        paymentMethod: 'Cash',
        metadata: { source: 'Manual' },
      }),
    ).toBe(true);
  });

  it('includes Rejected Reimbursement claims (R4)', () => {
    expect(
      isFuelExpenseLedgerVisibleRow({
        type: 'Reimbursement',
        category: 'Fuel Reimbursement',
        status: 'Rejected',
        metadata: { source: 'Manual' },
      }),
    ).toBe(true);
  });

  it('excludes Pending rows', () => {
    expect(
      isFuelExpenseLedgerVisibleRow({
        type: 'Reimbursement',
        category: 'Fuel',
        status: 'Pending',
        metadata: { source: 'Manual' },
      }),
    ).toBe(false);
  });

  it('excludes non-fuel expenses', () => {
    expect(
      isFuelExpenseLedgerVisibleRow({
        type: 'Expense',
        category: 'Toll',
        status: 'Approved',
      }),
    ).toBe(false);
  });
});
