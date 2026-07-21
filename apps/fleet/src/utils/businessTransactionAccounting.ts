export type BusinessTransactionEventType =
  | 'maintenance'
  | 'operating_expense'
  | 'other_income';

export type BusinessTransactionClassification = {
  eventType: BusinessTransactionEventType;
  direction: 'inflow' | 'outflow';
};

const EXPENSE_CATEGORIES = new Set([
  'insurance',
  'registration',
  'cash collection fees',
  'bank charges',
  'office expenses',
  'software/subscription',
  'marketing',
  'vehicle payment',
  'supplier payment',
  'tax payment',
  'other expenses',
]);

const INCOME_CATEGORIES = new Set([
  'surge pricing',
  'bonuses',
  'other income',
]);

/**
 * Classify posted manual business transactions only. Fuel, Toll, wallet and
 * trip-derived categories return null because specialized writers own them.
 */
export function classifyPostedBusinessTransaction(
  categoryInput: unknown,
  statusInput: unknown = 'Completed',
): BusinessTransactionClassification | null {
  const status = String(statusInput ?? 'Completed').trim().toLowerCase();
  if (!['completed', 'approved', 'verified', 'reconciled'].includes(status)) return null;

  const category = String(categoryInput ?? '').trim().toLowerCase();
  if (category === 'maintenance') {
    return { eventType: 'maintenance', direction: 'outflow' };
  }
  if (EXPENSE_CATEGORIES.has(category)) {
    return { eventType: 'operating_expense', direction: 'outflow' };
  }
  if (INCOME_CATEGORIES.has(category)) {
    return { eventType: 'other_income', direction: 'inflow' };
  }
  return null;
}
