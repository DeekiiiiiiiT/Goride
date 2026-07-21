import { describe, expect, it } from 'vitest';
import { classifyPostedBusinessTransaction } from './businessTransactionAccounting';

describe('classifyPostedBusinessTransaction', () => {
  it('posts realized maintenance as an expense', () => {
    expect(classifyPostedBusinessTransaction('Maintenance', 'Completed')).toEqual({
      eventType: 'maintenance',
      direction: 'outflow',
    });
  });

  it('maps ordinary overhead and other income', () => {
    expect(classifyPostedBusinessTransaction('Insurance', 'Approved')).toEqual({
      eventType: 'operating_expense',
      direction: 'outflow',
    });
    expect(classifyPostedBusinessTransaction('Other Income', 'Reconciled')).toEqual({
      eventType: 'other_income',
      direction: 'inflow',
    });
  });

  it('does not post pending/rejected/void transactions', () => {
    expect(classifyPostedBusinessTransaction('Office Expenses', 'Pending')).toBeNull();
    expect(classifyPostedBusinessTransaction('Office Expenses', 'Rejected')).toBeNull();
    expect(classifyPostedBusinessTransaction('Office Expenses', 'Void')).toBeNull();
  });

  it('leaves specialized categories to their existing writers', () => {
    expect(classifyPostedBusinessTransaction('Fuel', 'Completed')).toBeNull();
    expect(classifyPostedBusinessTransaction('Tolls', 'Completed')).toBeNull();
    expect(classifyPostedBusinessTransaction('InDrive Wallet Credit', 'Completed')).toBeNull();
    expect(classifyPostedBusinessTransaction('Fare Earnings', 'Completed')).toBeNull();
  });
});
