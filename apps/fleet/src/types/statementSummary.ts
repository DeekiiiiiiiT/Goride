/**
 * Universal Statement Summary types
 *
 * Statement Summary = per-platform earnings statement (Uber CSV SSOT).
 * Fleet toll P&L (tag spend / credits / charged / net loss) lives on fleetTollSnapshot
 * and Toll Recon — not as fake "Toll Charges $0 + Reimbursements" on the Uber card.
 */

export type StatementPlatform = 'Uber' | 'Roam' | 'InDrive';

export type StatementSourceType = 'csv_import' | 'computed';

export type StatementTollStory =
  | 'uber_csv_credits'
  | 'no_platform_tolls'
  | 'trip_toll_expense';

export interface FleetTollSnapshot {
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
}

export interface StatementSummary {
  platform: StatementPlatform;
  periodStart: string;
  periodEnd: string;
  sourceType: StatementSourceType;

  netFare: number;
  promotions: number;
  tips: number;
  totalEarnings: number;

  /** How this platform should render toll lines. */
  tollStory?: StatementTollStory;
  /** Uber CSV Refunds:Toll credits (memo — not an expense). */
  uberTollCredits?: number;
  /** Same idea for any platform. */
  platformTollCredits?: number;
  /** Trip-level platform toll expense only (almost never Uber). */
  statementTollExpense?: number;

  /** @deprecated prefer statementTollExpense / platformTollCredits */
  tolls: number;
  tollCharges?: number;
  tollRefunds?: number;
  tollReimbursements?: number;
  tollAdjustments: number;
  /** Equals statementTollExpense — credits are not subtracted as expenses. */
  totalRefundsExpenses: number;

  periodAdjustments: number;

  cashCollected: number;
  bankTransfer: number;
  totalPayout: number;
  payoutObserved?: boolean;
  payoutReconciliationGap?: number;

  tripCount?: number;
  driverId?: string;
  driverName?: string;
}

export interface StatementSummaryParams {
  platform: StatementPlatform;
  startDate: string;
  endDate: string;
  driverId?: string;
}

export interface StatementSummaryResponse {
  summaries: StatementSummary[];
  fleetTollSnapshot?: FleetTollSnapshot;
  periodStart: string;
  periodEnd: string;
}

export const UBER_LINE_CODES = {
  TOTAL_EARNINGS: 'TOTAL_EARNINGS',
  NET_FARE: 'NET_FARE',
  FARE_COMPONENTS: 'FARE_COMPONENTS',
  PROMOTIONS: 'PROMOTIONS',
  TIPS: 'TIPS',
  REFUNDS_EXPENSES: 'REFUNDS_EXPENSES',
  REFUNDS_TOLL: 'REFUNDS_TOLL',
} as const;

export type UberLineCode = (typeof UBER_LINE_CODES)[keyof typeof UBER_LINE_CODES];

export function createEmptyFleetTollSnapshot(): FleetTollSnapshot {
  return {
    tagSpend: 0,
    tagSpendByPlatform: { Uber: 0, Roam: 0, InDrive: 0, Unlinked: 0 },
    platformCredits: 0,
    chargedToDrivers: 0,
    netTollLoss: 0,
    periodMatched: false,
  };
}

export function createEmptyStatementSummary(
  platform: StatementPlatform,
  periodStart: string,
  periodEnd: string,
  sourceType: StatementSourceType = 'computed',
): StatementSummary {
  return {
    platform,
    periodStart,
    periodEnd,
    sourceType,
    netFare: 0,
    promotions: 0,
    tips: 0,
    totalEarnings: 0,
    tollStory: 'no_platform_tolls',
    uberTollCredits: 0,
    platformTollCredits: 0,
    statementTollExpense: 0,
    tolls: 0,
    tollCharges: 0,
    tollRefunds: 0,
    tollReimbursements: 0,
    tollAdjustments: 0,
    totalRefundsExpenses: 0,
    periodAdjustments: 0,
    cashCollected: 0,
    bankTransfer: 0,
    totalPayout: 0,
    payoutObserved: false,
    payoutReconciliationGap: 0,
    tripCount: 0,
  };
}
