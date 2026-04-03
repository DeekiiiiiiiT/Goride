export type UberSsotComponent =
  | 'fareComponents'
  | 'promotions'
  | 'tips'
  | 'refundsAndExpenses';

export interface UberDriverStatementRow {
  'Total Earnings'?: string | number;
  'Total Earnings:Tip'?: string | number;
  'Total Earnings : Promotions'?: string | number;
  'Refunds & Expenses'?: string | number;
}

export interface UberSsotTotals {
  periodEarningsGross: number; // matches Uber "Total Earnings"
  fareComponents: number;
  promotions: number;
  tips: number;
  refundsAndExpenses: number;
  netEarnings?: number; // optional: periodEarningsGross - refundsAndExpenses
}

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * SSOT decomposition for Uber driver statement rows.
 * Enterprise definition contract:
 *   PeriodEarningsGross = FareComponents + Promotions + Tips
 *
 * FareComponents is derived to avoid double-counting:
 *   FareComponents = Total Earnings - Promotions - Tips
 */
export function parseUberDriverStatementSsot(row: UberDriverStatementRow): UberSsotTotals {
  const periodEarningsGross = toNum(row['Total Earnings']);
  const tips = toNum((row as any)['Total Earnings:Tip']);
  const promotions = toNum((row as any)['Total Earnings : Promotions']);
  const refundsAndExpenses = toNum(row['Refunds & Expenses']);

  const fareComponents = periodEarningsGross - promotions - tips;

  return {
    periodEarningsGross,
    fareComponents,
    promotions,
    tips,
    refundsAndExpenses,
    netEarnings: periodEarningsGross - refundsAndExpenses,
  };
}

export interface UberPaymentTransactionSsotLine {
  tripUuid?: string;
  tips: number; // from Paid to you:Your earnings:Tip
  fareComponents: number; // fare-only: sum fare parts EXCLUDING tips
  // statement-level components will be reconciled later
}

/**
 * SSOT extraction from a single `payments_transaction.csv` line.
 * Important: this function extracts only per-trip components available in the row.
 * Promotions and Refunds & Expenses are typically statement-level in Uber exports.
 */
export function parseUberPaymentTransactionSsotLine(row: Record<string, unknown>): UberPaymentTransactionSsotLine {
  const tripUuid = String(row['Trip UUID'] || row['tripUuid'] || '').trim() || undefined;

  // "payments_transaction.csv" tip amount for SSOT comes from the Tip column.
  // We intentionally do NOT force `tips = 0` for `trip fare adjust order` here.
  // Classification (tip vs prior-period adjustment) is handled later in `csvHelpers.ts`
  // where we have access to whether the Trip UUID exists in trip activity exports.
  let tips = toNum(row['Paid to you:Your earnings:Tip'] ?? row['Paid to you : Your earnings : Tip']);

  // Fare components are the fare-only parts; tips must be excluded.
  const fareParts = [
    row['Paid to you : Your earnings : Fare:Fare'],
    row['Paid to you:Your earnings:Fare:Fare'],
    row['Paid to you : Your earnings : Fare:Wait Time at Pickup'],
    row['Paid to you:Your earnings:Fare:Wait Time at Pickup'],
    row['Paid to you:Your earnings:Fare:Surge'],
    row['Paid to you : Your earnings : Fare:Surge'],
    row['Paid to you:Your earnings:Fare:Time at Stop'],
    row['Paid to you : Your earnings : Fare:Time at Stop'],
    row['Paid to you:Your earnings:Fare:Airport Surcharge'],
    row['Paid to you : Your earnings : Fare:Airport Surcharge'],
    row['Paid to you:Your earnings:Fare:Fare Adjustment'], // may be 0; adjustments are reconciled later per phase
    row['Paid to you:Your earnings:Taxes'],
    row['Paid to you : Your earnings : Taxes'],
  ];

  const fareComponents = fareParts.reduce((sum, p) => sum + toNum(p), 0);

  return { tripUuid, tips, fareComponents };
}

export interface UberSsotDiff {
  component: UberSsotComponent;
  expected: number;
  actual: number;
  delta: number;
}

/**
 * Reconciles SSOT totals computed from components vs Uber statement totals.
 * Returns structured diffs so we can pinpoint definition mismatches.
 */
export function diffUberSsot(
  statement: UberSsotTotals,
  actual: { fareComponents: number; promotions: number; tips: number; refundsAndExpenses: number },
  tolerance = 0.01
): UberSsotDiff[] {
  const diffs: UberSsotDiff[] = [];

  const pushIf = (component: UberSsotComponent, expected: number, actualVal: number) => {
    const delta = actualVal - expected;
    if (Math.abs(delta) > tolerance) {
      diffs.push({ component, expected, actual: actualVal, delta });
    }
  };

  pushIf('fareComponents', statement.fareComponents, actual.fareComponents);
  pushIf('promotions', statement.promotions, actual.promotions);
  pushIf('tips', statement.tips, actual.tips);
  pushIf('refundsAndExpenses', statement.refundsAndExpenses, actual.refundsAndExpenses);

  return diffs;
}

