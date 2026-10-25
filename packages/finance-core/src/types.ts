import type { WeekKey } from './periodKey.ts';

export type Money = number;
export type { WeekKey };
export type Basis = 'accrual' | 'cash';

export const KNOWN_PLATFORMS = ['Uber', 'Roam', 'InDrive'] as const;
export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];

export type DriverWeekStatement = {
  driverId: string;
  periodAnchor: WeekKey;
  periodEnd: string;
  timezone: string;
  grossRevenue: Money;
  tips: Money;
  tipsPaidToDriver: Money;
  tipsWithheld: Money;
  quotaTarget: Money | null;
  quotaPercent: number | null;
  quotaMet: boolean;
  driverShare: Money;
  fleetShare: Money;
  driverSharePercent: number;
  passengerCash: Money;
  uberCash: Money;
  nonUberTripCash: Money;
  uberTripCash: Money;
  cashSourceMismatch: Money;
  cashReturned: Money;
  cashWrittenOff: Money;
  cashStillHeld: Money;
  settlement: Money;
  payoutNet: Money;
  settlementPaid: Money;
  fuelCredits: Money;
  fuelDeduction: Money;
  cashTollWash: Money;
  tollPersonal: Money;
  tripCount: number;
  platformStats: Record<string, { earnings: number; tripCount: number; cashCollected: number; tolls: number }>;
  warnings: string[];
};

export type SettlementPeriodRow = {
  isFinalized: boolean;
  isEstimate?: boolean;
  netPayout: number;
  passengerCash?: number;
  cashOwed: number;
  cashPaid: number;
  cashPaidBreakdown?: { tollCredits?: number };
  cashTollWash?: number;
  personalTollCharge?: number;
  fuelCredits?: number;
  cashWrittenOff?: number;
  settlementPaid?: number;
  /** Signed corrections on this week. Positive means the company owes more. */
  postedAdjustments?: number;
  /** Cash custody brought forward from a prior closed week. */
  openingCashCustody?: number;
  /** Saved week balance. A finished week shows this instead of a second calculation. */
  settlementAmount?: number;
};
