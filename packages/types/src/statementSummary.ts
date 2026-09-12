/**
 * Universal Statement Summary types (shared package)
 * Statement = platform earnings; fleetTollSnapshot = Toll Recon P&L for the same window.
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

  tollStory?: StatementTollStory;
  uberTollCredits?: number;
  platformTollCredits?: number;
  statementTollExpense?: number;

  tolls: number;
  tollCharges?: number;
  tollRefunds?: number;
  tollReimbursements?: number;
  tollAdjustments: number;
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
