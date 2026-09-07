import { describe, expect, it } from 'vitest';
import {
  CLOSE_INVARIANT_EPS,
  canCloseWeek,
  checkCloseInvariants,
  type CloseInvariantInput,
} from './closeInvariants.ts';

const tyingWeek: CloseInvariantInput = {
  period: {
    driver_id: 'drv-1',
    period_anchor: '2026-08-31',
    fuel_deduction: 1200,
    fuel_fleet_share: 800,
    toll_spend: 5920,
    toll_cash_spend: 640,
    toll_tag_spend: 5280,
    toll_charged_to_driver: 2340,
    cash_collected: 8000,
    driver_share: 25000,
    fleet_share: 4000,
    tips_paid_to_driver: 300,
    earnings_gross: 29300,
  },
  fuelStatement: { driverShare: 1200, companyShare: 800 },
  tollStatement: {
    totalSpend: 5920,
    chargedToDriver: 2340,
    reimbursed: 3580,
    netLoss: 0,
  },
  earningsStatement: { passengerCash: 8000 },
};

describe('checkCloseInvariants (§6.4)', () => {
  it('a fully tying week produces zero blockers and may close', () => {
    const blockers = checkCloseInvariants(tyingWeek);
    expect(blockers).toEqual([]);
    expect(canCloseWeek(blockers)).toBe(true);
  });

  it('flags fuel driver-share drift beyond epsilon', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      fuelStatement: { driverShare: 1500, companyShare: 800 },
    });
    const fuel = blockers.find((b) => b.code === 'FUEL_DRIVER_SHARE_MISMATCH');
    expect(fuel).toBeTruthy();
    expect(fuel?.persisted).toBe(1200);
    expect(fuel?.expected).toBe(1500);
    expect(fuel?.delta).toBe(-300);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('flags toll spend + charged mismatches independently', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      tollStatement: { totalSpend: 6000, chargedToDriver: 2000, reimbursed: 3580, netLoss: 0 },
    });
    expect(blockers.map((b) => b.code).sort()).toEqual(
      ['TOLL_CHARGED_MISMATCH', 'TOLL_IDENTITY_UNBALANCED', 'TOLL_SPEND_MISMATCH'].sort(),
    );
  });

  it('flags the toll four-card identity when Spend−Reimbursed−Charged−NetLoss ≠ 0', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      tollStatement: { totalSpend: 5920, chargedToDriver: 2340, reimbursed: 1000, netLoss: 0 },
    });
    const identity = blockers.find((b) => b.code === 'TOLL_IDENTITY_UNBALANCED');
    expect(identity).toBeTruthy();
    // 5920 − 1000 − 2340 − 0 = 2580 residual
    expect(identity?.persisted).toBe(2580);
  });

  it('flags earnings_gross identity break', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      period: { ...tyingWeek.period, earnings_gross: 30000 },
    });
    const g = blockers.find((b) => b.code === 'EARNINGS_GROSS_IDENTITY');
    expect(g).toBeTruthy();
    expect(g?.expected).toBe(29300);
  });

  it('flags cash_collected vs earnings statement passenger cash', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      earningsStatement: { passengerCash: 7500 },
    });
    expect(blockers.some((b) => b.code === 'CASH_COLLECTED_MISMATCH')).toBe(true);
  });

  it('treats missing statements as blockers', () => {
    const blockers = checkCloseInvariants({
      period: tyingWeek.period,
    });
    expect(blockers.map((b) => b.code).sort()).toEqual(
      ['EARNINGS_STATEMENT_MISSING', 'FUEL_STATEMENT_MISSING', 'TOLL_STATEMENT_MISSING'].sort(),
    );
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('flags unbalanced statement accounts and settlement-vs-P&L drift', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      statementAccountSum: 12.5,
      settlementSumForWeek: 11109.21,
      businessWeekPnl: 11000,
    });
    expect(blockers.some((b) => b.code === 'STATEMENT_ACCOUNTS_UNBALANCED')).toBe(true);
    expect(blockers.some((b) => b.code === 'SETTLEMENT_PNL_MISMATCH')).toBe(true);
  });

  it('tolerates sub-epsilon rounding noise', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      fuelStatement: { driverShare: 1200 + CLOSE_INVARIANT_EPS / 2, companyShare: 800 },
    });
    expect(blockers).toEqual([]);
  });

  // Close Program Pass 2: the earnings + toll publishers derive their statement
  // amounts straight from the persisted period columns (netLoss derived so the
  // four-card identity balances). A week sealed that way must not block close.
  it('a week sealed by the Pass 2 publishers ties with zero blockers', () => {
    const period = {
      driver_id: 'drv-9',
      period_anchor: '2026-08-31',
      fuel_deduction: 1200,
      fuel_fleet_share: 800,
      toll_spend: 5920,
      toll_cash_spend: 640,
      toll_tag_spend: 5280,
      toll_charged_to_driver: 2340,
      toll_reimbursed: 1500,
      cash_collected: 8000,
      driver_share: 25000,
      fleet_share: 4000,
      tips_paid_to_driver: 300,
      earnings_gross: 29300,
      settlement_amount: 12345,
    };
    const blockers = checkCloseInvariants({
      period,
      fuelStatement: { driverShare: period.fuel_deduction, companyShare: period.fuel_fleet_share },
      // sealTollWeek: netLoss = spend − reimbursed − chargedToDriver.
      tollStatement: {
        totalSpend: period.toll_spend,
        chargedToDriver: period.toll_charged_to_driver,
        reimbursed: period.toll_reimbursed,
        netLoss: period.toll_spend - period.toll_reimbursed - period.toll_charged_to_driver,
      },
      // earnings publisher: passengerCash = cash_collected.
      earningsStatement: {
        passengerCash: period.cash_collected,
        driverShare: period.driver_share,
        companyShare: period.fleet_share,
        tipsPaidToDriver: period.tips_paid_to_driver,
      },
    });
    expect(blockers).toEqual([]);
    expect(canCloseWeek(blockers)).toBe(true);
  });

  it('M-1: cashSourceMismatch beyond ε blocks close', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      cashSourceMismatch: 12.5,
    });
    expect(blockers.some((b) => b.code === 'CASH_SOURCE_MISMATCH')).toBe(true);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  // Pass 3 / H-7: draft statements must block close (cannot greenwash).
  it('draft fuel statement blocks close as FUEL_STATEMENT_UNVERIFIED', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      fuelStatement: { driverShare: 1200, companyShare: 800, status: 'draft' },
    });
    expect(blockers.some((b) => b.code === 'FUEL_STATEMENT_UNVERIFIED')).toBe(true);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('draft toll statement blocks close as TOLL_STATEMENT_UNVERIFIED', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      tollStatement: {
        totalSpend: 5920,
        chargedToDriver: 2340,
        reimbursed: 3580,
        netLoss: 0,
        status: 'draft',
      },
    });
    expect(blockers.some((b) => b.code === 'TOLL_STATEMENT_UNVERIFIED')).toBe(true);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('deliberately mismatched statement amounts block close (non-tautological)', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      fuelStatement: { driverShare: 9999, companyShare: 800, status: 'closed' },
      earningsStatement: { passengerCash: 8000, status: 'closed' },
      tollStatement: {
        totalSpend: 5920,
        chargedToDriver: 2340,
        reimbursed: 3580,
        netLoss: 0,
        status: 'closed',
      },
    });
    expect(blockers.some((b) => b.code === 'FUEL_DRIVER_SHARE_MISMATCH')).toBe(true);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('warns when settlement sum is present but Business Finance P&L is unavailable', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      settlementSumForWeek: 11109.21,
      businessWeekPnlUnavailable: true,
    });
    const w = blockers.find((b) => b.code === 'BUSINESS_WEEK_PNL_UNAVAILABLE');
    expect(w?.severity).toBe('warn');
    expect(canCloseWeek(blockers)).toBe(true);
  });

  it('blocks when toll_spend ≠ cash + tag (TOLL_SPEND_SPLIT)', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      period: {
        ...tyingWeek.period,
        toll_spend: 0,
        toll_cash_spend: 0,
        toll_tag_spend: 1110,
      },
      tollStatement: {
        totalSpend: 0,
        chargedToDriver: 2340,
        reimbursed: 0,
        netLoss: 0,
      },
    });
    expect(blockers.some((b) => b.code === 'TOLL_SPEND_SPLIT')).toBe(true);
    expect(canCloseWeek(blockers)).toBe(false);
  });

  it('blocks when toll_usage events are orphaned from the ledger', () => {
    const blockers = checkCloseInvariants({
      ...tyingWeek,
      tollEventLedger: {
        orphanCount: 24,
        orphanAmountMajor: 8500,
        eventSpendMajor: 13760,
        ledgerSpendMajor: 5260,
      },
    });
    const orphan = blockers.find((b) => b.code === 'TOLL_EVENT_ORPHANED');
    expect(orphan).toBeTruthy();
    expect(orphan?.severity).toBe('block');
    expect(orphan?.delta).toBe(8500);
    expect(canCloseWeek(blockers)).toBe(false);
  });
});
