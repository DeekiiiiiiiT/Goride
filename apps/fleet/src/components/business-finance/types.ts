/**
 * Business Finance DTOs — owner read-only views.
 * Does not feed settlement math.
 */

export type BusinessFinanceTab =
  | 'overview'
  | 'pnl'
  | 'cash-bank'
  | 'expenses'
  | 'driver-balances'
  | 'workbench';

export type PeriodPreset = 'this_week' | 'last_week' | 'this_month' | 'custom';

export type BusinessFinancePeriod = {
  preset: PeriodPreset;
  startYmd: string;
  endYmd: string;
};

export type PnLLineId =
  | 'gross'
  | 'platform_fees'
  | 'net_trip'
  | 'fuel'
  | 'tolls'
  | 'maintenance'
  | 'wallet_loads'
  | 'driver_payouts'
  | 'operating_profit';

export type PnLLine = {
  id: PnLLineId | 'tolls_memo';
  label: string;
  /** null when not tracked yet — never display as $0 */
  amount: number | null;
  kind: 'total' | 'subtotal' | 'expense' | 'result' | 'memo';
  tracked?: boolean;
};

export type PlatformSplitRow = {
  platform: string;
  gross: number;
  fees: number;
  net: number;
};

/** Owner-facing Tolls accordion — same story as Toll Recon cards, P&L math. */
export type PnLTollBreakdown = {
  /** All tag/trip toll charges in the period (gross). */
  grossCharges: number;
  /** Cash-wash / personal / phantom / real refunds — already removed from fleet loss. */
  alreadyCovered: number;
  /** Posted Charge Driver amounts (wallet path; not double-counted in fleet loss). */
  chargedToDrivers: number;
  /** What hits the Tolls P&L line (unrecovered fleet loss). */
  fleetLoss: number;
};

/** Owner-facing Fuel accordion — Consumption Recon → Business Finance. */
export type PnLFuelBreakdown = {
  /** All fill spend in the period (gross fuel_expense). */
  grossSpend: number;
  /** Driver-share offsets already removed from fleet loss. */
  alreadyCovered: number;
  /** Wallet fuel reimbursements to drivers (memo only; not netted into fleet loss). */
  reimbursedToDrivers: number;
  /** What hits the Fuel P&L line (unrecovered fleet loss). */
  fleetLoss: number;
};

export type BusinessFinancePnL = {
  lines: PnLLine[];
  operatingRatio: number | null;
  platformSplit: PlatformSplitRow[];
  coverageNote?: string;
  /** Tolls that were recovered (refund) or washed out (cash_wash/phantom/personal) — NOT a fleet loss, excluded from the Tolls expense line but shown for transparency. */
  tollsRecoveredWashed?: number;
  /** Collapsible Tolls detail for owners; omit when no toll activity in period. */
  tollBreakdown?: PnLTollBreakdown;
  /** Fuel already charged to drivers — excluded from Fuel expense line. */
  fuelRecoveredWashed?: number;
  /** Collapsible Fuel detail; omit when no fuel activity in period. */
  fuelBreakdown?: PnLFuelBreakdown;
};

export type BusinessFinanceOverview = {
  moneyIn: {
    grossEarnings: number;
    bankExpected: number;
    bankReceived: number;
    cashCollected: number;
    cashStillHeld: number;
  };
  moneyOut: {
    fuel: number;
    tolls: number;
    maintenance: number | null;
    walletLoads: number;
    driverPayouts: number;
  };
  profit: {
    operatingProfit: number;
    operatingRatio: number | null;
  };
  risks: {
    needsStatementWeeks: number;
    highCashDrivers: number;
    tollVarianceFlags: number;
    fuelVarianceFlags: number;
    /** Drivers with estimated InDrive wallet balance below short threshold. */
    walletShortDriverCount: number;
  };
  incompleteSources: string[];
};

export type CashBankSnapshot = {
  platformBank: {
    expected: number;
    received: number;
    variance: number;
    needsStatementWeeks: number;
  };
  driverCash: {
    totalStillHeld: number;
    topDebtors: Array<{ driverId: string; name: string; amount: number }>;
  };
  walletLoads: {
    periodLoads: number;
    shortDriverCount: number;
  };
  incompleteSources: string[];
};

export type ExpenseCategoryId = 'fuel' | 'toll' | 'maintenance' | 'other';

export type ExpenseCategorySummary = {
  id: ExpenseCategoryId;
  label: string;
  amount: number | null;
  tracked: boolean;
  deepLinkPage?: string;
  deepLinkLabel?: string;
  /** Short caption under the amount, e.g. "$X business-absorbed · $Y recovered/washed" */
  note?: string;
};

export type ExpenseRow = {
  id: string;
  dateYmd: string;
  category: string;
  description: string;
  amount: number;
  source: string;
};

export type ExpensesSnapshot = {
  categories: ExpenseCategorySummary[];
  rows: ExpenseRow[];
  incompleteSources: string[];
};

export type DriverBalanceRow = {
  driverId: string;
  name: string;
  cashStillHeld: number;
  companyOwes: number;
  bankSettled: 'pending' | 'confirmed' | 'unknown';
  weekLabel: string;
  periodAnchor: string;
  status: string;
};

export type DriverBalancesSnapshot = {
  rows: DriverBalanceRow[];
  incompleteSources: string[];
  /** True when fetch capped at first N drivers */
  truncated?: boolean;
  truncateCap?: number;
};

export type BusinessFinanceBundle = {
  period: BusinessFinancePeriod;
  overview: BusinessFinanceOverview;
  pnl: BusinessFinancePnL;
  cashBank: CashBankSnapshot;
  expenses: ExpensesSnapshot;
  driverBalances: DriverBalancesSnapshot;
};
