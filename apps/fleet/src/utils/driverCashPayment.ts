import type { FinancialTransaction } from '../types/data';

/** Driver → fleet cash handoff (Payments Log, wallet totals, weekly settlement). */
export function isDriverCashPaymentTransaction(
  t: Pick<FinancialTransaction, 'amount' | 'category' | 'type' | 'description' | 'paymentMethod'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;

  if (t.paymentMethod === 'Tag Balance') return false;
  if (t.description?.toLowerCase().includes('top-up')) return false;

  const cat = (t.category || '').toLowerCase();
  const type = (t.type || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();

  if (cat === 'toll usage' || cat === 'toll' || cat === 'tolls') return false;
  if (cat.includes('fuel') || desc.includes('fuel') || type.includes('fuel')) return false;

  if (t.category === 'Cash Collection' || t.type === 'Payment_Received') return true;

  // Legacy rows: type Revenue + cash category before Payment_Received existed
  if (type === 'revenue' && cat.includes('cash')) return true;

  // Legacy manual logs keyed by description
  if (desc.includes('cash payment from driver') || desc.includes('cash collection from driver')) {
    return true;
  }

  return false;
}
