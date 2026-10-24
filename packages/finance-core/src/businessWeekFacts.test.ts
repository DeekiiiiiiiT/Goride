import { describe, expect, it } from 'vitest';
import {
  agreementChecks,
  cashHeldExcludingReceivable,
  companyFuelCost,
  latestStatements,
  netSettlementMovements,
  periodSealStatus,
  profitAfterCompanyFuel,
  settlementFuelCreditMajor,
} from './businessWeekFacts';

describe('business week facts', () => {
  it('nets posted pays and drops a reversed pay', () => {
    const net = netSettlementMovements([
      { kind: 'pay', status: 'posted', amountMinor: 10000 },
      { kind: 'pay', status: 'void', amountMinor: 5000 },
      { kind: 'collect', status: 'posted', amountMinor: 2500 },
      { kind: 'reverse', status: 'posted', amountMinor: 1000, reversesKind: 'pay' },
    ]);
    expect(net).toEqual({ paid: 90, collected: 25 });
  });

  it('keeps an overpayment out of cash held', () => {
    expect(cashHeldExcludingReceivable(23491.88, 13191.88)).toBe(10300);
  });

  it('uses the sealed company share only when the week is closed', () => {
    expect(companyFuelCost({
      sealed: true,
      sealedCompanyShare: 17191.88,
      engineCompanyShare: 19000,
    })).toBe(17191.88);
    expect(companyFuelCost({
      sealed: false,
      sealedCompanyShare: 17191.88,
      engineCompanyShare: 18000,
    })).toBe(18000);
  });

  it('is Closed only when fuel, tolls, and earnings are sealed', () => {
    const rows = latestStatements([
      { kind: 'fuel', driverId: 'a', weekKey: '2026-10-12', version: 1, status: 'draft', amountsMinor: {} },
      { kind: 'fuel', driverId: 'a', weekKey: '2026-10-12', version: 2, status: 'closed', amountsMinor: { companyShare: 100 } },
      { kind: 'toll', driverId: 'a', weekKey: '2026-10-12', version: 1, status: 'closed', amountsMinor: {} },
      { kind: 'earnings', driverId: 'a', weekKey: '2026-10-12', version: 1, status: 'closed', amountsMinor: {} },
    ]);
    expect(periodSealStatus(rows, ['2026-10-12'])).toBe('Closed');
    expect(periodSealStatus(rows, ['2026-10-19'])).toBe('Open');
  });

  it('replaces pump fuel in profit with the company share', () => {
    expect(profitAfterCompanyFuel({
      operatingProfit: 100,
      fuelInProfit: 21500,
      companyFuel: 17191.88,
      fixedInProfit: 0,
      fixedReplacement: null,
      cashBasis: false,
      payoutsInProfit: 0,
      movementPays: 0,
    })).toBe(4408.12);
  });

  it('fails a week when the books do not match the statement', () => {
    const [revenue] = agreementChecks({
      ledgerGross: 62797.4,
      sealedEarningsGross: 63479.4,
      earningsHeld: false,
      ledgerFuel: 1,
      sealedFuelSpend: 1,
      ledgerTolls: 1,
      sealedTollNet: 1,
      payouts: 1,
      movementPays: 1,
      bankExpected: 1,
      bankDeposits: 1,
      statementSummary: 1,
      ledgerStatement: 1,
    });
    expect(revenue.held).toBe(false);
    expect(revenue.ok).toBe(false);
    expect(revenue.difference).toBe(-682);
  });

  it('passes payouts and bank only when the two sides match', () => {
    const rows = agreementChecks({
      ledgerGross: 1,
      sealedEarningsGross: 1,
      earningsHeld: false,
      ledgerFuel: 1,
      sealedFuelSpend: 1,
      ledgerTolls: 1,
      sealedTollNet: 1,
      payouts: 100,
      movementPays: 40,
      bankExpected: 500,
      bankDeposits: 480,
      statementSummary: 1,
      ledgerStatement: 1,
    });
    const payouts = rows.find((row) => row.id === 'payouts');
    const bank = rows.find((row) => row.id === 'bank');
    expect(payouts?.ok).toBe(false);
    expect(payouts?.difference).toBe(60);
    expect(bank?.ok).toBe(false);
    expect(bank?.difference).toBe(20);
  });

  it('does not treat company fuel share as driver cash', () => {
    expect(settlementFuelCreditMajor({ amount: 17191.88, companyShare: 17191.88 })).toBe(0);
    expect(settlementFuelCreditMajor({ amount: 17191.88, driverPaidFuel: 1808.12 })).toBe(1808.12);
  });
});
