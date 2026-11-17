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

/**
 * Step 4 opening / week movements from per-week tag numbers (new toll system).
 * `weeks` covers the week after the last saved closing up to and including `weekKey`.
 * Weeks before `weekKey` carry into the opening (a closed week with no saved closing is
 * never skipped). With no saved closing at all, the statement closing anchors the opening.
 */
export function tagAccountOpeningFromWeeks(input: {
  weekKey: string;
  prior: { openingMinor: number; priorWeekKey: string | null };
  weeks: Array<{ weekKey: string; topUpsMinor: number; usageMinor: number }>;
  statementClosingMinor: number | null;
}): {
  openingMinor: number;
  openingFromStatement: boolean;
  topUpsMinor: number;
  tagUsageMinor: number;
  carriedWeekKeys: string[];
} {
  const thisWeek = input.weeks.find((w) => w.weekKey === input.weekKey);
  const topUpsMinor = thisWeek?.topUpsMinor ?? 0;
  const tagUsageMinor = thisWeek?.usageMinor ?? 0;
  const carried = input.weeks.filter((w) => w.weekKey < input.weekKey);
  const openingFromStatement = input.prior.priorWeekKey === null && input.statementClosingMinor != null;
  if (openingFromStatement) {
    return {
      openingMinor: Math.round(Number(input.statementClosingMinor)) - topUpsMinor + tagUsageMinor,
      openingFromStatement,
      topUpsMinor,
      tagUsageMinor,
      carriedWeekKeys: [],
    };
  }
  return {
    openingMinor: input.prior.openingMinor + carried.reduce((n, w) => n + w.topUpsMinor - w.usageMinor, 0),
    openingFromStatement,
    topUpsMinor,
    tagUsageMinor,
    carriedWeekKeys: carried.map((w) => w.weekKey),
  };
}
