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
  settlementPaid?: number;
}

export interface PeriodSettlementResult {
  netPayout: number;
  tollChargedToDriver: number;
  tollCashWash: number;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  adjCashBalance: number;
  grossSettlement: number;
  settlementPaid: number;
  /** Outstanding after payouts when company owes. Positive = company owes driver. */
  settlement: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const netPayout = round((i.driverShare || 0) - (i.fuelDeduction || 0));
  const tollPersonal = round(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round(Math.max(0, i.tollCashWash || 0));
  const fuelCredits = round(Math.max(0, i.fuelCredits || 0));
  const cashWrittenOff = round(Math.max(0, i.cashWrittenOff || 0));
  const settlementPaidIn = round(Math.max(0, i.settlementPaid || 0));

  const cashOwed = round((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round(cashOwed - cashPaid);
  const adjCashBalance = round(cashBalance - fuelCredits - cashWrittenOff);
  const grossSettlement = round(netPayout - adjCashBalance);
  const settlementPaid =
    grossSettlement > 0.005 ? round(Math.min(settlementPaidIn, grossSettlement)) : 0;
  const settlement =
    grossSettlement > 0.005 ? round(grossSettlement - settlementPaid) : grossSettlement;

  return {
    netPayout,
    tollChargedToDriver: tollPersonal,
    tollCashWash,
    cashOwed,
    cashPaid,
    cashBalance,
    adjCashBalance,
    grossSettlement,
    settlementPaid,
    settlement,
  };
}
