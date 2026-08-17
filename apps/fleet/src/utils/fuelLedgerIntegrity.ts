/**
 * Gas card ops anchors do not use driver wallet debit/credit — ledger health differs from cash.
 */
import type { FuelEntry } from '../types/fuel';
import { isGasCardFuelEntry } from './fuelPaidByDriver';

export type FuelLedgerIntegrity = 'Complete' | 'Partial' | 'Orphaned' | 'Pending';

/** Ledger health for Transaction Logs — gas card fills never need wallet pairs. */
export function resolveGasCardLedgerIntegrity(entry: FuelEntry): FuelLedgerIntegrity | null {
  if (!isGasCardFuelEntry(entry)) return null;
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  if (meta.awaitingCardStatement) return 'Pending';
  if (meta.jaaMatchedStatementId || entry.reconciliationStatus === 'Verified') return 'Complete';
  return 'Pending';
}
