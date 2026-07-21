import { describe, expect, it } from 'vitest';
import {
  allocateEvenly,
  assertBalanced,
  buildAccrualJournal,
  buildPaymentJournal,
  buildVoidJournal,
  canApproveDocument,
  canTransition,
  hubCategoryToCanonicalEventType,
} from '../expenseHubJournal';
import type { ExpenseDocument, ExpensePayment } from '../../types/expenseHub';

const baseDoc = (over: Partial<ExpenseDocument> = {}): ExpenseDocument => ({
  id: 'doc1',
  status: 'approved',
  category: 'Insurance',
  description: 'Fleet insurance',
  incurredDate: '2026-07-01',
  currency: 'USD',
  grossAmount: 100,
  taxAmount: 0,
  netAmount: 100,
  allocations: [
    { vehicleId: 'v1', amount: 60 },
    { vehicleId: 'v2', amount: 40 },
  ],
  version: 1,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  ...over,
});

describe('expenseHubJournal', () => {
  it('builds a balanced accrual journal', () => {
    const j = buildAccrualJournal(baseDoc(), 'org1');
    expect(j.kind).toBe('accrual');
    expect(j.idempotencyKey).toBe('expense_doc:doc1|accrual|v1');
    assertBalanced(j.lines);
  });

  it('builds a balanced payment journal', () => {
    const payment: ExpensePayment = {
      id: 'pay1',
      documentId: 'doc1',
      amount: 40,
      currency: 'USD',
      paymentDate: '2026-07-15',
      paymentMethod: 'bank',
      createdAt: '2026-07-15T00:00:00Z',
    };
    const j = buildPaymentJournal(payment, 'org1');
    assertBalanced(j.lines);
    expect(j.idempotencyKey).toBe('expense_payment:pay1|settle');
  });

  it('void reverses accrual', () => {
    const j = buildVoidJournal(baseDoc(), 'org1', '2026-07-20');
    assertBalanced(j.lines);
    expect(j.kind).toBe('void');
  });

  it('allocates cents without drift', () => {
    const rows = allocateEvenly(100, Array.from({ length: 3 }, (_, i) => `v${i}`));
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 2);
  });

  it('enforces lifecycle transitions', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('paid', 'draft')).toBe(false);
  });

  it('blocks self-approve by default', () => {
    expect(
      canApproveDocument({
        createdBy: 'u1',
        actorId: 'u1',
        allowSelfApprove: false,
      }),
    ).toBe(false);
    expect(
      canApproveDocument({
        createdBy: 'u1',
        actorId: 'u2',
        allowSelfApprove: false,
      }),
    ).toBe(true);
  });

  it('maps categories to canonical event types', () => {
    expect(hubCategoryToCanonicalEventType('Insurance')).toBe('fixed_expense');
    expect(hubCategoryToCanonicalEventType('Maintenance')).toBe('maintenance');
    expect(hubCategoryToCanonicalEventType('Office Supplies')).toBe('operating_expense');
  });
});
