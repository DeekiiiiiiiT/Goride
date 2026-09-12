/**
 * Statement Summary toll lines — platform earnings statement only.
 *
 * NOT the same engine as Toll Recon week cards:
 * - Recon Spend/Reimbursed = plaza usages + trip.tollCharges
 * - Statement = cash/platform fare economics per Uber/Roam/InDrive
 *
 * Excludes plaza toll_charge (transaction) and toll_charge_offset (P&L wash).
 */
import { round2 } from './money.ts';

export const STATEMENT_TOLL_RECON_EPS = 0.01;

export type StatementTollStory =
  | 'uber_csv_credits'
  | 'no_platform_tolls'
  | 'trip_toll_expense';

export type StatementTollBuckets = {
  /** Trip-level platform toll expense (rare for Uber). */
  tollCharges: number;
  tollRefunds: number;
  /** Fare-embedded credits (Uber CSV Refunds:Toll → toll_reimbursement). */
  tollReimbursements: number;
  reimbursedTripIds: Set<string>;
};

export type StatementTollPresentation = {
  /** CSV Refunds:Toll credits (Uber) or any platform fare toll credits. */
  platformTollCredits: number;
  /** Alias when platform is Uber. */
  uberTollCredits: number;
  /** Trip-level expense only — never plaza tag spend. */
  statementTollExpense: number;
  tollStory: StatementTollStory;
  /** Legacy aliases kept for older clients during one release. */
  tollCharges: number;
  tollRefunds: number;
  tollReimbursements: number;
  tollAdjustments: number;
  totalRefundsExpenses: number;
};

export function presentStatementToll(
  buckets: StatementTollBuckets,
  platform: string,
): StatementTollPresentation {
  const expense = round2(Math.max(0, buckets.tollCharges));
  const refunds = round2(Math.max(0, buckets.tollRefunds));
  const credits = round2(Math.max(0, buckets.tollReimbursements + buckets.tollRefunds));
  const reimbursementsOnly = round2(Math.max(0, buckets.tollReimbursements));
  const plat = String(platform || '');

  let tollStory: StatementTollStory = 'no_platform_tolls';
  if (plat === 'Uber' && credits > STATEMENT_TOLL_RECON_EPS) {
    tollStory = 'uber_csv_credits';
  } else if (expense > STATEMENT_TOLL_RECON_EPS) {
    tollStory = 'trip_toll_expense';
  } else if (credits > STATEMENT_TOLL_RECON_EPS) {
    tollStory = 'uber_csv_credits';
  }

  // Credits are memo lines — they do NOT reduce Net Period Earnings as "expense".
  const statementTollExpense =
    tollStory === 'trip_toll_expense' ? round2(Math.max(0, expense - reimbursementsOnly)) : 0;

  return {
    platformTollCredits: credits,
    uberTollCredits: plat === 'Uber' ? credits : 0,
    statementTollExpense,
    tollStory,
    tollCharges: expense,
    tollRefunds: refunds,
    tollReimbursements: reimbursementsOnly,
    tollAdjustments: credits,
    totalRefundsExpenses: statementTollExpense,
  };
}

/** @deprecated use presentStatementToll — kept for tests that assert bucket math */
export function netStatementTollExpense(
  buckets: Omit<StatementTollBuckets, 'reimbursedTripIds'> | StatementTollBuckets,
): {
  tollCharges: number;
  tollRefunds: number;
  tollReimbursements: number;
  tollAdjustments: number;
  totalRefundsExpenses: number;
  netTollExpenseSigned: number;
} {
  const tollCharges = round2(Math.max(0, buckets.tollCharges));
  const tollRefunds = round2(Math.max(0, buckets.tollRefunds));
  const tollReimbursements = round2(Math.max(0, buckets.tollReimbursements));
  const tollAdjustments = round2(tollRefunds + tollReimbursements);
  const netTollExpenseSigned = round2(tollCharges - tollAdjustments);
  return {
    tollCharges,
    tollRefunds,
    tollReimbursements,
    tollAdjustments,
    totalRefundsExpenses: round2(Math.max(0, netTollExpenseSigned)),
    netTollExpenseSigned,
  };
}

export type StatementTollEventLike = {
  eventType?: string | null;
  netAmount?: number | null;
  direction?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: {
    lineCode?: string | null;
    direction?: string | null;
    reason?: string | null;
    tripId?: string | null;
    sourceType?: string | null;
  } | null;
};

function eventSourceType(event: StatementTollEventLike): string {
  return String(event.sourceType || event.metadata?.sourceType || '').toLowerCase();
}

function eventTripId(event: StatementTollEventLike): string {
  const fromMeta = event.metadata?.tripId;
  if (fromMeta) return String(fromMeta);
  if (eventSourceType(event) === 'trip' && event.sourceId) return String(event.sourceId);
  return '';
}

export function applyStatementTollEvent(
  buckets: StatementTollBuckets,
  event: StatementTollEventLike,
  platform: string,
): StatementTollBuckets | null {
  const t = String(event.eventType || '');
  const mag = Math.abs(Number(event.netAmount) || 0);
  if (!(mag > 0) && t !== 'statement_line') return null;

  switch (t) {
    case 'toll_charge': {
      if (eventSourceType(event) === 'transaction') return null;
      return { ...buckets, tollCharges: buckets.tollCharges + mag };
    }
    case 'toll_refund':
      return { ...buckets, tollRefunds: buckets.tollRefunds + mag };
    case 'toll_support_adjustment': {
      const tripId = eventTripId(event);
      if (tripId && buckets.reimbursedTripIds.has(tripId)) return null;
      // Support adjustments are Uber CSV toll credits when not dual-written as reimbursement.
      return { ...buckets, tollReimbursements: buckets.tollReimbursements + mag };
    }
    case 'toll_reimbursement': {
      const tripId = eventTripId(event);
      const nextIds = tripId
        ? new Set(buckets.reimbursedTripIds).add(tripId)
        : buckets.reimbursedTripIds;
      return {
        ...buckets,
        tollReimbursements: buckets.tollReimbursements + mag,
        reimbursedTripIds: nextIds,
      };
    }
    case 'toll_charge_offset':
      return null;
    case 'statement_line':
      if (event.metadata?.lineCode === 'REFUNDS_TOLL' && platform !== 'Uber') {
        return { ...buckets, tollReimbursements: buckets.tollReimbursements + mag };
      }
      return null;
    default:
      return null;
  }
}

export function emptyStatementTollBuckets(): StatementTollBuckets {
  return {
    tollCharges: 0,
    tollRefunds: 0,
    tollReimbursements: 0,
    reimbursedTripIds: new Set(),
  };
}

export function deriveStatementBankPlug(
  totalEarnings: number,
  statementTollExpense: number,
  cashCollected: number,
): number {
  return round2(totalEarnings - statementTollExpense - cashCollected);
}

export function statementPayoutReconciliationGap(args: {
  totalEarnings: number;
  statementTollExpense: number;
  periodAdjustments: number;
  totalPayout: number;
}): number {
  const expected = round2(
    args.totalEarnings - args.statementTollExpense + args.periodAdjustments,
  );
  return round2(args.totalPayout - expected);
}

export type FleetTollSnapshot = {
  tagSpend: number;
  tagSpendByPlatform: {
    Uber: number;
    Roam: number;
    InDrive: number;
    Unlinked: number;
  };
  platformCredits: number;
  chargedToDrivers: number;
  netTollLoss: number;
  periodMatched: boolean;
};
