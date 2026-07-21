/**
 * Balanced journal helpers for Expense Hub documents.
 * Projects to canonical ledger vocabulary; specialist desks stay on their own writers.
 */

import type { ExpenseDocument, ExpensePayment, JournalLine, ExpenseJournalEntry } from '../types/expenseHub.ts';

const EPS = 0.005;

export function assertBalanced(lines: JournalLine[]): void {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(debit - credit) > EPS) {
    throw new Error(`Unbalanced journal: debit=${debit} credit=${credit}`);
  }
}

/** Round allocations so the last vehicle absorbs the penny remainder. */
export function allocateEvenly(total: number, vehicleIds: string[]): Array<{ vehicleId: string; amount: number }> {
  if (vehicleIds.length === 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / vehicleIds.length);
  let remainder = cents - base * vehicleIds.length;
  return vehicleIds.map((vehicleId, i) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { vehicleId, amount: (base + extra) / 100 };
  });
}

export function buildAccrualJournal(
  doc: ExpenseDocument,
  organizationId: string,
): ExpenseJournalEntry {
  const amount = Math.round(doc.netAmount * 100) / 100;
  const lines: JournalLine[] =
    doc.allocations.length > 0
      ? [
          ...doc.allocations.map((a) => ({
            account: 'expense' as const,
            debit: Math.round(a.amount * 100) / 100,
            credit: 0,
            vehicleId: a.vehicleId,
            category: String(doc.category),
            memo: doc.description,
          })),
          {
            account: 'accounts_payable',
            debit: 0,
            credit: amount,
            memo: doc.vendorName || doc.description,
          },
        ]
      : [
          {
            account: 'expense',
            debit: amount,
            credit: 0,
            category: String(doc.category),
            memo: doc.description,
          },
          {
            account: 'accounts_payable',
            debit: 0,
            credit: amount,
            memo: doc.vendorName || doc.description,
          },
        ];

  assertBalanced(lines);
  return {
    id: `journal_accrual_${doc.id}_v${doc.version}`,
    organizationId,
    documentId: doc.id,
    kind: 'accrual',
    date: doc.incurredDate,
    lines,
    idempotencyKey: `expense_doc:${doc.id}|accrual|v${doc.version}`,
    createdAt: new Date().toISOString(),
  };
}

export function buildPaymentJournal(
  payment: ExpensePayment,
  organizationId: string,
): ExpenseJournalEntry {
  const amount = Math.round(payment.amount * 100) / 100;
  const lines: JournalLine[] = [
    {
      account: 'accounts_payable',
      debit: amount,
      credit: 0,
      memo: payment.reference || 'Payment',
    },
    {
      account: 'cash',
      debit: 0,
      credit: amount,
      memo: payment.paymentMethod,
    },
  ];
  assertBalanced(lines);
  return {
    id: `journal_pay_${payment.id}`,
    organizationId,
    documentId: payment.documentId,
    paymentId: payment.id,
    kind: 'payment',
    date: payment.paymentDate,
    lines,
    idempotencyKey: `expense_payment:${payment.id}|settle`,
    createdAt: new Date().toISOString(),
  };
}

export function buildVoidJournal(
  doc: ExpenseDocument,
  organizationId: string,
  voidDate: string,
): ExpenseJournalEntry {
  const accrual = buildAccrualJournal(doc, organizationId);
  const lines: JournalLine[] = accrual.lines.map((l) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
    memo: `Void: ${l.memo || doc.description}`,
  }));
  assertBalanced(lines);
  return {
    id: `journal_void_${doc.id}_v${doc.version}`,
    organizationId,
    documentId: doc.id,
    kind: 'void',
    date: voidDate,
    lines,
    idempotencyKey: `expense_doc:${doc.id}|void|v${doc.version}`,
    createdAt: new Date().toISOString(),
  };
}

/** Map Hub category to canonical event type used by BF P&L. */
export function hubCategoryToCanonicalEventType(
  category: string,
): 'operating_expense' | 'maintenance' | 'fixed_expense' {
  const c = category.toLowerCase();
  if (c === 'maintenance' || c === 'repairs') return 'maintenance';
  if (
    ['insurance', 'lease', 'gps', 'software', 'permits', 'equipment', 'security', 'other'].includes(c)
  ) {
    return 'fixed_expense';
  }
  return 'operating_expense';
}

export function canTransition(
  from: ExpenseDocument['status'],
  to: ExpenseDocument['status'],
): boolean {
  const allowed: Record<ExpenseDocument['status'], ExpenseDocument['status'][]> = {
    draft: ['submitted', 'voided'],
    submitted: ['approved', 'rejected', 'voided'],
    approved: ['posted', 'voided'],
    rejected: ['draft', 'voided'],
    posted: ['partially_paid', 'paid', 'voided'],
    partially_paid: ['paid', 'voided'],
    paid: ['voided'],
    voided: [],
  };
  return (allowed[from] || []).includes(to);
}

/** Separation of duties: creator cannot approve own submission unless owner policy. */
export function canApproveDocument(opts: {
  createdBy?: string;
  submittedBy?: string;
  actorId: string;
  allowSelfApprove: boolean;
}): boolean {
  if (opts.allowSelfApprove) return true;
  const author = opts.submittedBy || opts.createdBy;
  if (!author) return true;
  return author !== opts.actorId;
}
