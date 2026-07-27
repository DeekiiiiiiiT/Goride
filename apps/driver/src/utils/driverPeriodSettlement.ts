/**
 * The ONE shared per-period settlement calculation — SSOT with fleet app.
 * Copy of apps/fleet/src/utils/driverPeriodSettlement.ts — keep in sync.
 */

export interface PeriodSettlementInput {
  driverShare: number;
  fuelDeduction: number;
  baseCashOwed: number;
  baseCashPaid: number;
  tollCashWash: number;
  tollPersonal: number;
  fuelCredits?: number;
  cashWrittenOff?: number;
}

export interface PeriodSettlementResult {
  netPayout: number;
  tollChargedToDriver: number;
  tollCashWash: number;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  adjCashBalance: number;
  /** netPayout − adjCashBalance. Positive = company owes the driver; negative = driver owes the company. */
  settlement: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const netPayout = round((i.driverShare || 0) - (i.fuelDeduction || 0));
  const tollPersonal = round(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round(Math.max(0, i.tollCashWash || 0));
  const fuelCredits = round(Math.max(0, i.fuelCredits || 0));
  const cashWrittenOff = round(Math.max(0, i.cashWrittenOff || 0));

  const cashOwed = round((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round(cashOwed - cashPaid);
  const adjCashBalance = round(cashBalance - fuelCredits - cashWrittenOff);
  const settlement = round(netPayout - adjCashBalance);

  return {
    netPayout,
    tollChargedToDriver: tollPersonal,
    tollCashWash,
    cashOwed,
    cashPaid,
    cashBalance,
    adjCashBalance,
    settlement,
  };
}
