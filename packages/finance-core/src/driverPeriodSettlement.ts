import { round2 } from './money.ts';

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
  /** Tips paid to the driver this week (quota met or quota off). Adds to net payout. */
  tipsPaidToDriver?: number;
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
  /** Raw cleared Driver Payout sum tagged to the week (never silently clamped away). */
  settlementPaid: number;
  /** max(0, settlementPaid − max(0, grossSettlement)) — fleet overpay vs current gross. */
  overpaidAmount: number;
  settlement: number;
}

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const tipsPaid = round2(Math.max(0, i.tipsPaidToDriver || 0));
  const netPayout = round2((i.driverShare || 0) - (i.fuelDeduction || 0) + tipsPaid);
  const tollPersonal = round2(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round2(Math.max(0, i.tollCashWash || 0));
  const fuelCredits = round2(Math.max(0, i.fuelCredits || 0));
  const cashWrittenOff = round2(Math.max(0, i.cashWrittenOff || 0));
  const settlementPaid = round2(Math.max(0, i.settlementPaid || 0));

  const cashOwed = round2((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round2((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round2(cashOwed - cashPaid);
  const adjCashBalance = round2(cashBalance - fuelCredits - cashWrittenOff);
  const grossSettlement = round2(netPayout - adjCashBalance);

  let overpaidAmount = 0;
  let settlement: number;
  if (grossSettlement > 0.005) {
    overpaidAmount = round2(Math.max(0, settlementPaid - grossSettlement));
    settlement =
      overpaidAmount > 0.005
        ? round2(-overpaidAmount)
        : round2(grossSettlement - settlementPaid);
  } else {
    // Driver owes / zero: any prior payout is excess vs current gross (do not zero paid).
    overpaidAmount = settlementPaid > 0.005 ? settlementPaid : 0;
    settlement = grossSettlement;
  }

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
    overpaidAmount,
    settlement,
  };
}
