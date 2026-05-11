/**
 * Universal Statement Summary types
 * 
 * This template is used across all platforms (Uber, Roam, InDrive).
 * - Uber: Data comes from CSV imports (statement_line events)
 * - Roam/InDrive: Data is computed on-the-fly from trip and ledger records
 */

export type StatementPlatform = 'Uber' | 'Roam' | 'InDrive';

export type StatementSourceType = 'csv_import' | 'computed';

/**
 * Universal Statement Summary structure
 * Based on Uber's statement format, adapted for all platforms
 */
export interface StatementSummary {
  platform: StatementPlatform;
  periodStart: string;
  periodEnd: string;
  sourceType: StatementSourceType;
  
  // Period Net Earnings
  netFare: number;
  promotions: number;
  tips: number;
  totalEarnings: number;
  
  // Refunds & Expenses
  tolls: number;
  tollAdjustments: number;
  totalRefundsExpenses: number;
  
  // Adjustments
  periodAdjustments: number;
  
  // Payout
  cashCollected: number;
  bankTransfer: number;
  totalPayout: number;
  
  // Metadata
  tripCount?: number;
  driverId?: string;
  driverName?: string;
}

/**
 * Parameters for fetching statement summaries
 */
export interface StatementSummaryParams {
  platform: StatementPlatform;
  startDate: string;
  endDate: string;
  driverId?: string;
}

/**
 * Response from the statement summary API
 */
export interface StatementSummaryResponse {
  summaries: StatementSummary[];
  periodStart: string;
  periodEnd: string;
}

/**
 * Line codes used in Uber statement_line events
 */
export const UBER_LINE_CODES = {
  TOTAL_EARNINGS: 'TOTAL_EARNINGS',
  NET_FARE: 'NET_FARE',
  FARE_COMPONENTS: 'FARE_COMPONENTS',
  PROMOTIONS: 'PROMOTIONS',
  TIPS: 'TIPS',
  REFUNDS_EXPENSES: 'REFUNDS_EXPENSES',
  REFUNDS_TOLL: 'REFUNDS_TOLL',
} as const;

export type UberLineCode = typeof UBER_LINE_CODES[keyof typeof UBER_LINE_CODES];

/**
 * Helper to create an empty statement summary with zeros
 */
export function createEmptyStatementSummary(
  platform: StatementPlatform,
  periodStart: string,
  periodEnd: string,
  sourceType: StatementSourceType = 'computed'
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
    tolls: 0,
    tollAdjustments: 0,
    totalRefundsExpenses: 0,
    periodAdjustments: 0,
    cashCollected: 0,
    bankTransfer: 0,
    totalPayout: 0,
    tripCount: 0,
  };
}
