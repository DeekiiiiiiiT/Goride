import { MONEY_EPS } from './money.ts';

export type TagAccountRollForwardInput = {
  openingMinor: number;
  /** Tag credits (top-ups, refunds) — always non-negative magnitude. */
  topUpsMinor: number;
  /** Tag usage debits — always non-negative magnitude. */
  tagUsageMinor: number;
  /** Provider statement closing balance (minor units), when entered. */
  statementClosingMinor?: number | null;
};

export type TagAccountRollForwardResult = {
  expectedClosingMinor: number;
  varianceMinor: number | null;
  ties: boolean;
};

/**
 * Prepaid tag roll-forward: opening + credits − usage = expected closing.
 * Ledger convention: usage amounts are negative; top-ups/refunds positive.
 * Pass usage and top-ups as positive magnitudes.
 */
export function computeTagAccountRollForward(
  input: TagAccountRollForwardInput,
): TagAccountRollForwardResult {
  const opening = Math.round(Number(input.openingMinor) || 0);
  const topUps = Math.max(0, Math.round(Number(input.topUpsMinor) || 0));
  const usage = Math.max(0, Math.round(Number(input.tagUsageMinor) || 0));
  const expectedClosingMinor = opening + topUps - usage;

  const stmtRaw = input.statementClosingMinor;
  if (stmtRaw == null || !Number.isFinite(Number(stmtRaw))) {
    return { expectedClosingMinor, varianceMinor: null, ties: false };
  }

  const statementClosingMinor = Math.round(Number(stmtRaw));
  const varianceMinor = statementClosingMinor - expectedClosingMinor;
  const ties = Math.abs(varianceMinor) <= Math.round(MONEY_EPS * 100);

  return { expectedClosingMinor, varianceMinor, ties };
}

/** Sum ledger-signed amount into top-up or usage bucket (minor units). */
export function tagLedgerAmountToRollForwardParts(entry: {
  type?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  status?: string | null;
  metadata?: { voided?: boolean } | null;
}): { topUpMinor: number; usageMinor: number } {
  const status = String(entry.status || '').toLowerCase();
  if (status === 'voided' || entry.metadata?.voided === true) {
    return { topUpMinor: 0, usageMinor: 0 };
  }

  const pm = String(entry.paymentMethod || '').toLowerCase();
  if (
    pm.includes('cash') ||
    pm.includes('card') ||
    pm.includes('fleet') ||
    pm.includes('account')
  ) {
    return { topUpMinor: 0, usageMinor: 0 };
  }

  const t = String(entry.type || '').toLowerCase();
  const amt = Number(entry.amount);
  if (!Number.isFinite(amt) || amt === 0) return { topUpMinor: 0, usageMinor: 0 };

  if (t === 'top_up' || t === 'refund' || (t === 'adjustment' && amt > 0)) {
    return { topUpMinor: Math.round(Math.abs(amt) * 100), usageMinor: 0 };
  }
  if (t === 'usage' || (t === 'adjustment' && amt < 0)) {
    return { topUpMinor: 0, usageMinor: Math.round(Math.abs(amt) * 100) };
  }

  if (amt > 0) return { topUpMinor: Math.round(Math.abs(amt) * 100), usageMinor: 0 };
  if (amt < 0) return { topUpMinor: 0, usageMinor: Math.round(Math.abs(amt) * 100) };
  return { topUpMinor: 0, usageMinor: 0 };
}
