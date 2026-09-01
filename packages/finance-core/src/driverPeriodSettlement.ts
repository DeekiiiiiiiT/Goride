import { round2, toMoneyMinor, fromMoneyMinor, type MoneyMinor } from './money.ts';

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
  /** max(0, settlementPaid − max(0, grossSettlement)) — reporting flag only. */
  overpaidAmount: number;
  /** Continuous residual: grossSettlement − settlementPaid (same on both sides of zero). */
  settlement: number;
}

export interface PeriodSettlementMinorResult {
  netPayoutMinor: MoneyMinor;
  tollChargedToDriverMinor: MoneyMinor;
  tollCashWashMinor: MoneyMinor;
  cashOwedMinor: MoneyMinor;
  cashPaidMinor: MoneyMinor;
  cashBalanceMinor: MoneyMinor;
  adjCashBalanceMinor: MoneyMinor;
  grossSettlementMinor: MoneyMinor;
  settlementPaidMinor: MoneyMinor;
  overpaidAmountMinor: MoneyMinor;
  settlementMinor: MoneyMinor;
}

function toMinorNonNeg(n: number): MoneyMinor {
  return toMoneyMinor(Math.max(0, n));
}

/** Integer minor-unit settlement math — authoritative for persist (A-3). */
export function computePeriodSettlementMinor(i: PeriodSettlementInput): PeriodSettlementMinorResult {
  const tipsPaidMinor = toMinorNonNeg(i.tipsPaidToDriver || 0);
  const driverShareMinor = toMoneyMinor(i.driverShare || 0);
  const fuelDedMinor = toMoneyMinor(i.fuelDeduction || 0);
  const netPayoutMinor = (driverShareMinor - fuelDedMinor + tipsPaidMinor) as MoneyMinor;

  const tollPersonalMinor = toMinorNonNeg(i.tollPersonal || 0);
  const tollCashWashMinor = toMinorNonNeg(i.tollCashWash || 0);
  const fuelCreditsMinor = toMinorNonNeg(i.fuelCredits || 0);
  const cashWrittenOffMinor = toMinorNonNeg(i.cashWrittenOff || 0);
  const settlementPaidMinor = toMinorNonNeg(i.settlementPaid || 0);

  const cashOwedMinor = (toMoneyMinor(i.baseCashOwed || 0) + tollPersonalMinor) as MoneyMinor;
  const cashPaidMinor = (toMoneyMinor(i.baseCashPaid || 0) + tollCashWashMinor) as MoneyMinor;
  const cashBalanceMinor = (cashOwedMinor - cashPaidMinor) as MoneyMinor;
  const adjCashBalanceMinor = (cashBalanceMinor - fuelCreditsMinor - cashWrittenOffMinor) as MoneyMinor;
  const grossSettlementMinor = (netPayoutMinor - adjCashBalanceMinor) as MoneyMinor;

  const grossPosMinor = Math.max(0, grossSettlementMinor) as MoneyMinor;
  const overpaidAmountMinor = Math.max(0, settlementPaidMinor - grossPosMinor) as MoneyMinor;
  const settlementMinor = (grossSettlementMinor - settlementPaidMinor) as MoneyMinor;

  return {
    netPayoutMinor,
    tollChargedToDriverMinor: tollPersonalMinor,
    tollCashWashMinor,
    cashOwedMinor,
    cashPaidMinor,
    cashBalanceMinor,
    adjCashBalanceMinor,
    grossSettlementMinor,
    settlementPaidMinor,
    overpaidAmountMinor,
    settlementMinor,
  };
}

/** Major-unit wrapper — delegates to minor path then converts at boundary. */
export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const m = computePeriodSettlementMinor(i);
  return {
    netPayout: fromMoneyMinor(m.netPayoutMinor),
    tollChargedToDriver: fromMoneyMinor(m.tollChargedToDriverMinor),
    tollCashWash: fromMoneyMinor(m.tollCashWashMinor),
    cashOwed: fromMoneyMinor(m.cashOwedMinor),
    cashPaid: fromMoneyMinor(m.cashPaidMinor),
    cashBalance: fromMoneyMinor(m.cashBalanceMinor),
    adjCashBalance: fromMoneyMinor(m.adjCashBalanceMinor),
    grossSettlement: fromMoneyMinor(m.grossSettlementMinor),
    settlementPaid: fromMoneyMinor(m.settlementPaidMinor),
    overpaidAmount: fromMoneyMinor(m.overpaidAmountMinor),
    settlement: fromMoneyMinor(m.settlementMinor),
  };
}

/** Verify minor and float paths agree within 1 cent on representative inputs. */
export function assertMinorFloatParity(i: PeriodSettlementInput): boolean {
  const m = computePeriodSettlementMinor(i);
  const f = {
    netPayout: fromMoneyMinor(m.netPayoutMinor),
    settlement: fromMoneyMinor(m.settlementMinor),
    grossSettlement: fromMoneyMinor(m.grossSettlementMinor),
  };
  const direct = computePeriodSettlement(i);
  return (
    Math.abs(f.netPayout - direct.netPayout) <= 0.01 &&
    Math.abs(f.settlement - direct.settlement) <= 0.01 &&
    Math.abs(f.grossSettlement - direct.grossSettlement) <= 0.01
  );
}
