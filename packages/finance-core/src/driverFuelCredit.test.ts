import { describe, expect, it } from 'vitest';
import {
  fuelCreditOverpayment,
  isCompanyFuelShareCreditJump,
  owedWithDriverPaidFuel,
  reviewSettlementPay,
} from './driverFuelCredit.ts';

const oct12 = {
  driverShare: 15770.42,
  fuelDeduction: 1808.12,
  cashCollected: 23970.65,
  cashReturned: 10000,
  driverPaidFuel: 4000,
  companyFuelShare: 17191.88,
  settlementPaid: 17183.53,
};

describe('driver fuel credit', () => {
  it('Oct 12–18 owes 3991.65 when only the driver cash fills are credited', () => {
    expect(owedWithDriverPaidFuel(oct12)).toBeCloseTo(3991.65, 2);
  });

  it('a gas-card-only week does not increase what the company owes', () => {
    const cardOnly = owedWithDriverPaidFuel({
      ...oct12,
      driverPaidFuel: 0,
      companyFuelShare: 15000,
      settlementPaid: 0,
    });
    const noFuel = owedWithDriverPaidFuel({
      ...oct12,
      driverPaidFuel: 0,
      companyFuelShare: 0,
      settlementPaid: 0,
    });
    expect(cardOnly).toBeCloseTo(noFuel, 2);
  });

  it('books 13191.88 still owed by the driver after the cash payout', () => {
    expect(fuelCreditOverpayment(oct12)).toBeCloseTo(13191.88, 2);
  });

  it('recognises the company-share jump on fuel finalize', () => {
    expect(
      isCompanyFuelShareCreditJump({
        owedBeforeFuelFinalize: 1799.77,
        owedAfterFuelFinalize: 17183.53,
        companyFuelShare: 17191.88,
        driverFuelDeduction: 1808.12,
        driverPaidFuel: 4000,
      }),
    ).toBe(true);
    expect(
      isCompanyFuelShareCreditJump({
        owedBeforeFuelFinalize: 100,
        owedAfterFuelFinalize: 100,
        companyFuelShare: 500,
        driverFuelDeduction: 0,
        driverPaidFuel: 0,
      }),
    ).toBe(false);
  });

  it('refuses a draft restatement and a payment that is not the closed amount', () => {
    expect(
      reviewSettlementPay({ amount: 17183.53, closedResidual: 3991.65, hasPendingRestatement: true }),
    ).toMatchObject({ ok: false, code: 'PENDING_RESTATEMENT' });
    expect(
      reviewSettlementPay({ amount: 17183.53, closedResidual: 3991.65, hasPendingRestatement: false }),
    ).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
    expect(
      reviewSettlementPay({
        amount: 3991.65,
        closedResidual: 3991.65,
        hasPendingRestatement: false,
        threshold: 50_000,
      }),
    ).toEqual({ ok: true, needsApproval: false });
    expect(
      reviewSettlementPay({
        amount: 50000,
        closedResidual: 50000,
        hasPendingRestatement: false,
        threshold: 50_000,
      }),
    ).toEqual({ ok: true, needsApproval: true });
  });
});
