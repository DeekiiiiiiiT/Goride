import { describe, expect, it } from 'vitest';
import {
  compareFuelStatementVsEngine,
  compareTollStatementVsEngine,
  compareEarningsStatementVsEngine,
  engineDriftsToCloseBlockers,
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
