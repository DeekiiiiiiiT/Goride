import { round2 } from './money.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

const EPS = 0.01;

/**
 * Cash the driver laid out for fuel. Company gas-card spend is never a credit.
 * Passing the company share here is what overpaid the Oct 12–18 week.
 */
export function driverPaidFuelCredit(driverPaidFuel: number): number {
  return round2(Math.max(0, Number(driverPaidFuel) || 0));
}

export type FuelCreditWeekInput = {
  driverShare: number;
  fuelDeduction: number;
  cashCollected: number;
  cashReturned: number;
  driverPaidFuel: number;
  companyFuelShare: number;
  settlementPaid?: number;
  tipsPaidToDriver?: number;
};

/** What the company owes the driver when only driver-paid fuel is credited. */
export function owedWithDriverPaidFuel(input: FuelCreditWeekInput): number {
  return computePeriodSettlement({
    driverShare: input.driverShare,
    fuelDeduction: input.fuelDeduction,
    baseCashOwed: input.cashCollected,
    baseCashPaid: input.cashReturned,
    tollCashWash: 0,
    tollPersonal: 0,
    fuelCredits: driverPaidFuelCredit(input.driverPaidFuel),
    settlementPaid: input.settlementPaid || 0,
    tipsPaidToDriver: input.tipsPaidToDriver || 0,
  }).grossSettlement;
}

/**
 * Closed-week overpayment caused by crediting the company fuel share.
 * Positive means the driver was paid too much and now owes the company.
 * Does not change the cash payment already made.
 */
export function fuelCreditOverpayment(input: FuelCreditWeekInput): number {
  const correct = owedWithDriverPaidFuel({ ...input, settlementPaid: 0 });
  const paid = round2(Math.max(0, Number(input.settlementPaid) || 0));
  return round2(Math.max(0, paid - Math.max(0, correct)));
}

/**
 * True when fuel finalize moved the payout by the company share minus the
 * driver fuel deduction — the Oct 12 pattern. Driver-paid fuel is not that jump.
 */
export function isCompanyFuelShareCreditJump(input: {
  owedBeforeFuelFinalize: number;
  owedAfterFuelFinalize: number;
  companyFuelShare: number;
  driverFuelDeduction: number;
  driverPaidFuel: number;
}): boolean {
  const jump = round2(input.owedAfterFuelFinalize - input.owedBeforeFuelFinalize);
  const bugJump = round2(
    (Number(input.companyFuelShare) || 0) - (Number(input.driverFuelDeduction) || 0),
  );
  return (
    (Number(input.companyFuelShare) || 0) > driverPaidFuelCredit(input.driverPaidFuel) + EPS &&
    bugJump > EPS &&
    Math.abs(jump - bugJump) <= EPS
  );
}

export type SettlementPayReview =
  | { ok: true; needsApproval: boolean }
  | { ok: false; code: 'PENDING_RESTATEMENT' | 'AMOUNT_MISMATCH'; message: string };

/** Pay the closed residual only. A draft restatement cannot be paid. */
export function reviewSettlementPay(input: {
  amount: number;
  closedResidual: number;
  hasPendingRestatement: boolean;
  threshold?: number;
}): SettlementPayReview {
  if (input.hasPendingRestatement) {
    return {
      ok: false,
      code: 'PENDING_RESTATEMENT',
      message: 'A draft restatement is open. Pay the closed statement after it is sealed.',
    };
  }
  const amount = round2(Number(input.amount) || 0);
  const residual = round2(Math.max(0, Number(input.closedResidual) || 0));
  if (Math.abs(amount - residual) > EPS) {
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      message: `Payment must equal the closed statement amount of ${residual.toFixed(2)}.`,
    };
  }
  const threshold = Number(input.threshold) || 0;
  return { ok: true, needsApproval: threshold > 0 && amount >= threshold };
}

/** Stamp for the next open week. The original payout stays on the closed week. */
export function fuelOverpaymentReceivableStamp(input: {
  amount: number;
  sourceWeek: string;
  driverPaidFuel: number;
  companyFuelShare: number;
}) {
  return {
    fuelCreditReceivableApplied: true,
    fuelCreditReceivable: {
      amount: round2(input.amount),
      sourceWeek: String(input.sourceWeek).slice(0, 10),
      driverPaidFuel: driverPaidFuelCredit(input.driverPaidFuel),
      companyFuelShare: round2(Number(input.companyFuelShare) || 0),
      reason:
        'Fuel finalize credited company gas-card spend to the driver. Collect, offset, or write off from Driver Balances. The cash already paid is unchanged.',
    },
  };
}
