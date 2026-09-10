import { describe, expect, it } from 'vitest';
import {
  countTollPeriodSealDrift,
  tollPeriodDisagreesWithSeal,
} from './tollPeriodSealDrift.ts';
import { checkCloseInvariants, type CloseInvariantInput } from './closeInvariants.ts';

describe('tollPeriodSealDrift', () => {
  it('detects spend and charged drift', () => {
    expect(
      tollPeriodDisagreesWithSeal(
        { tollSpend: 3860, tollChargedToDriver: 0 },
        { totalSpend: 3575, chargedToDriver: 285 },
      ),
    ).toBe(true);
  });

  it('ties within ε', () => {
    expect(
      tollPeriodDisagreesWithSeal(
        { tollSpend: 3575, tollChargedToDriver: 285 },
        { totalSpend: 3575, chargedToDriver: 285 },
      ),
    ).toBe(false);
  });

  it('counts only rows with a seal', () => {
    expect(
      countTollPeriodSealDrift([
        {
          tollSpend: 3860,
          tollChargedToDriver: 0,
          sealSpend: 3575,
          sealCharged: 285,
        },
        {
          tollSpend: 100,
          tollChargedToDriver: 0,
          sealSpend: null,
          sealCharged: null,
        },
        {
          tollSpend: 50,
          tollChargedToDriver: 10,
          sealSpend: 50,
          sealCharged: 10,
        },
      ]),
    ).toBe(1);
  });
});

describe('seal→rebuild clears TOLL_*_MISMATCH (contract)', () => {
  it('matching period + seal has no toll mismatch blockers', () => {
    const tying: CloseInvariantInput = {
      period: {
        driver_id: 'd1',
        period_anchor: '2026-01-26',
        fuel_deduction: 0,
        fuel_fleet_share: 0,
        toll_spend: 3575,
        toll_cash_spend: 3290,
        toll_tag_spend: 285,
        toll_charged_to_driver: 285,
        cash_collected: 0,
        driver_share: 0,
        fleet_share: 0,
        tips_paid_to_driver: 0,
        earnings_gross: 0,
        settlement_amount: 0,
        cash_still_held: 0,
      },
      fuelStatement: { driverShare: 0, companyShare: 0 },
      tollStatement: {
        totalSpend: 3575,
        chargedToDriver: 285,
        reimbursed: 3290,
        netLoss: 0,
      },
      earningsStatement: { passengerCash: 0 },
    };
    const blockers = checkCloseInvariants(tying);
    expect(blockers.filter((b) => b.code.endsWith('_MISMATCH') && b.code.startsWith('TOLL_'))).toEqual(
      [],
    );
  });
});
