import { addDaysYmd } from './ledgerMoneyAggregate.ts';
import { MONEY_EPS } from './money.ts';

export type TagAccountOpeningResetPayload = {
  statementClosingMinor: number;
  openingMinor: number;
  previousOpeningMinor: number;
  differenceMinor: number;
  reason?: string | null;
};

export type TagAccountOpeningResetEvent = {
  id?: number | string;
  kind: string;
  at?: string;
  actor?: string;
  reason?: string | null;
  payload?: Record<string, unknown>;
};

export type ActiveTagAccountOpeningReset = TagAccountOpeningResetPayload & {
  eventId?: number | string;
  actor?: string;
  at?: string;
  reason: string;
};

/** Opening that ties to the statement: statement closing − top-ups + usage. */
export function computeOpeningFromStatementClosing(input: {
  statementClosingMinor: number;
  topUpsMinor: number;
  tagUsageMinor: number;
}): number {
  const stmt = Math.round(Number(input.statementClosingMinor));
  const topUps = Math.max(0, Math.round(Number(input.topUpsMinor) || 0));
  const usage = Math.max(0, Math.round(Number(input.tagUsageMinor) || 0));
  return stmt - topUps + usage;
}

/** Payload fields for a starting-balance reset from baseline roll and statement. */
export function buildTagAccountOpeningResetPayload(input: {
  statementClosingMinor: number;
  previousOpeningMinor: number;
  topUpsMinor: number;
  tagUsageMinor: number;
  reason: string;
}): TagAccountOpeningResetPayload {
  const statementClosingMinor = Math.round(Number(input.statementClosingMinor));
  const previousOpeningMinor = Math.round(Number(input.previousOpeningMinor));
  const openingMinor = computeOpeningFromStatementClosing({
    statementClosingMinor,
    topUpsMinor: input.topUpsMinor,
    tagUsageMinor: input.tagUsageMinor,
  });
  return {
    statementClosingMinor,
    openingMinor,
    previousOpeningMinor,
    differenceMinor: openingMinor - previousOpeningMinor,
    reason: String(input.reason).trim(),
  };
}

/**
 * Latest active reset on a run (append-only: undone resets are folded out).
 * Events ordered oldest → newest.
 */
export function effectiveTagOpeningReset(events: TagAccountOpeningResetEvent[]): ActiveTagAccountOpeningReset | null {
  let active: ActiveTagAccountOpeningReset | null = null;
  for (const ev of events) {
    const kind = String(ev.kind);
    if (kind === 'tag_account_opening_reset') {
      const p = (ev.payload ?? {}) as Partial<TagAccountOpeningResetPayload>;
      const statementClosingMinor = Math.round(Number(p.statementClosingMinor));
      const openingMinor = Math.round(Number(p.openingMinor));
      const previousOpeningMinor = Math.round(Number(p.previousOpeningMinor));
      const differenceMinor = Math.round(Number(p.differenceMinor));
      if (
        !Number.isFinite(statementClosingMinor) ||
        !Number.isFinite(openingMinor) ||
        !Number.isFinite(previousOpeningMinor) ||
        !Number.isFinite(differenceMinor)
      ) {
        continue;
      }
      active = {
        eventId: ev.id,
        actor: ev.actor,
        at: ev.at,
        reason: String(p.reason ?? ev.reason ?? '').trim(),
        statementClosingMinor,
        openingMinor,
        previousOpeningMinor,
        differenceMinor,
      };
    } else if (kind === 'tag_account_opening_reset_undo') {
      active = null;
    }
  }
  return active;
}

/** Roll-forward numbers when an opening reset is active for the current week. */
export function tagAccountRollAfterReset(input: {
  topUpsMinor: number;
  tagUsageMinor: number;
  reset: ActiveTagAccountOpeningReset;
}): TagAccountRollForwardResult & {
  openingMinor: number;
  statementClosingMinor: number;
} {
  const openingMinor = input.reset.openingMinor;
  const statementClosingMinor = input.reset.statementClosingMinor;
  const roll = computeTagAccountRollForward({
    openingMinor,
    topUpsMinor: input.topUpsMinor,
    tagUsageMinor: input.tagUsageMinor,
    statementClosingMinor,
  });
  return { openingMinor, statementClosingMinor, ...roll };
}

export function tagAccountFirstWeekAfterReset(resetWeekKey: string): string {
  return addDaysYmd(String(resetWeekKey).slice(0, 10), 7);
}

/** False when a reset anchor exists and this week is on or before the reset week (no legacy toll reads). */
export function tagAccountUseOldTollRecords(input: {
  resetAnchorWeekKey: string | null;
  weekKey: string;
}): boolean {
  if (!input.resetAnchorWeekKey) return true;
  return input.weekKey > input.resetAnchorWeekKey.slice(0, 10);
}

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
