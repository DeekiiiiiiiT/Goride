import { describe, expect, it } from 'vitest';
import {
  compareFuelStatementVsEngine,
  compareTollStatementVsEngine,
  compareEarningsStatementVsEngine,
  engineDriftsToCloseBlockers,
  shouldSkipZeroActivityTollCompare,
  isTollEngineActivity,
} from './statementEngineCompare.ts';
import { checkCloseInvariants } from './closeInvariants.ts';

describe('statementEngineCompare', () => {
  it('returns empty when fuel statement matches engine', () => {
    const drifts = compareFuelStatementVsEngine(
      { kind: 'fuel', amountsMinor: { driverShare: 10050, companyShare: 20000 } },
      { driverShare: 100.5, companyShare: 200 },
    );
    expect(drifts).toEqual([]);
  });

  it('flags fuel drift beyond 1¢', () => {
    const drifts = compareFuelStatementVsEngine(
      { kind: 'fuel', amountsMinor: { driverShare: 10000, companyShare: 20000 } },
      { driverShare: 100.5, companyShare: 200 },
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0].field).toBe('driverShare');
    expect(drifts[0].deltaMinor).toBe(-50);
  });

  it('flags toll spend drift', () => {
    const drifts = compareTollStatementVsEngine(
      {
        kind: 'toll',
        amountsMinor: { totalSpend: 500000, chargedToDriver: 100000, reimbursed: 200000 },
      },
      { totalSpend: 5920, chargedToDriver: 1000, reimbursed: 2000 },
    );
    expect(drifts.some((d) => d.field === 'totalSpend')).toBe(true);
  });

  it('maps $0 seal vs engine spend to TOLL_STALE_ZERO_SEAL', () => {
    const drifts = compareTollStatementVsEngine(
      { kind: 'toll', amountsMinor: { totalSpend: 0, chargedToDriver: 0, reimbursed: 0 } },
      { totalSpend: 1110, chargedToDriver: 0, reimbursed: 0 },
    );
    const blockers = engineDriftsToCloseBlockers(drifts, {
      driverId: 'd1',
      week: '2026-08-31',
    });
    expect(blockers.some((b) => b.code === 'TOLL_STALE_ZERO_SEAL')).toBe(true);
    expect(blockers.find((b) => b.code === 'TOLL_STALE_ZERO_SEAL')?.message).toMatch(/Prepare lanes/i);
  });

  it('shouldSkipZeroActivityTollCompare only when engine is also empty', () => {
    expect(isTollEngineActivity({ totalSpend: 1110, chargedToDriver: 0, reimbursed: 0 })).toBe(true);
    expect(
      shouldSkipZeroActivityTollCompare('zero_activity_na', {
        totalSpend: 0,
        chargedToDriver: 0,
        reimbursed: 0,
      }),
    ).toBe(true);
    expect(
      shouldSkipZeroActivityTollCompare('zero_activity_na', {
        totalSpend: 1110,
        chargedToDriver: 0,
        reimbursed: 0,
      }),
    ).toBe(false);
  });

  it('engine drifts become close blockers', () => {
    const drifts = compareEarningsStatementVsEngine(
      {
        kind: 'earnings',
        amountsMinor: {
          driverShare: 10000,
          companyShare: 20000,
          tipsPaidToDriver: 0,
          passengerCash: 30000,
          gross: 30000,
        },
      },
      {
        driverShare: 105,
        companyShare: 200,
        tipsPaidToDriver: 0,
        passengerCash: 300,
        gross: 300,
      },
    );
    const blockers = engineDriftsToCloseBlockers(drifts, {
      driverId: 'd1',
      week: '2026-08-24',
    });
    expect(blockers.every((b) => b.code === 'EARNINGS_ENGINE_DRIFT')).toBe(true);
    const result = checkCloseInvariants({
      period: { driver_id: 'd1', period_anchor: '2026-08-24' },
      fuelStatement: { driverShare: 0, companyShare: 0, status: 'closed' },
      tollStatement: { totalSpend: 0, chargedToDriver: 0, status: 'closed' },
      earningsStatement: { passengerCash: 0, status: 'closed' },
      engineDrifts: blockers,
    });
    expect(result.some((b) => b.code === 'EARNINGS_ENGINE_DRIFT' && b.severity === 'block')).toBe(
      true,
    );
  });
});
