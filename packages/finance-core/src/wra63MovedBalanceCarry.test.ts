import { describe, expect, it } from 'vitest';
import {
  checkMovedBalanceCarried,
  movedBalanceItemsToCloseBlockers,
  movedBalanceNotCarriedMessage,
  type MovedBalanceSourceInput,
} from './movedBalanceCarryCheck';
import { round2 } from './money';
import type { CorrectionLine } from './fuelShareCorrection';

const LANDING = '2026-10-19';

const KENNY_OWED_WEEKS: Array<{ week: string; sealed: number; fuelShare: number }> = [
  { week: '2026-02-02', sealed: -10_640.43, fuelShare: 7_316.23 },
  { week: '2026-02-09', sealed: -17_961.09, fuelShare: 7_316.23 },
  { week: '2026-02-23', sealed: -14_690.46, fuelShare: 7_316.23 },
  { week: '2026-03-02', sealed: -12_029.67, fuelShare: 7_316.23 },
];

function kennySource(week: string, sealed: number): MovedBalanceSourceInput {
  return {
    periodAnchor: week,
    metadata: { financeCore: { balanceMovedTo: LANDING } },
    balanceMovedTo: LANDING,
    liveSettlementAmount: sealed,
    projectedAt: '2026-09-10T12:00:00Z',
    preFuelToolSettlement: sealed,
    driverShare: 0,
    fuelDeduction: 0,
    cashCollected: 0,
    cashReturned: 0,
    tollChargedToDriver: 0,
    tollCashSpend: 0,
    fuelDriverSpend: 0,
    cashWrittenOff: 0,
    settlementPaid: 0,
    tipsPaidToDriver: 0,
  };
}

function fuelOnlyLandingLines(): CorrectionLine[] {
  return KENNY_OWED_WEEKS.map(({ week, fuelShare }) => ({
    sourceWeek: week,
    amount: fuelShare,
    sentence: '',
    kind: 'fuel_share',
  }));
}

function repairedLandingLines(): CorrectionLine[] {
  const fuel = fuelOnlyLandingLines();
  const carried: CorrectionLine[] = KENNY_OWED_WEEKS.map(({ week, sealed }) => ({
    sourceWeek: week,
    amount: sealed,
    sentence: '',
    kind: 'carried_balance',
  }));
  return [...fuel, ...carried];
}

describe('WRA-63 moved balance carry guard (Kenny live numbers)', () => {
  it('before repair: four blockers totalling −55,321.65', () => {
    const sources = KENNY_OWED_WEEKS.map(({ week, sealed }) => kennySource(week, sealed));
    const items = checkMovedBalanceCarried({
      landingWeek: LANDING,
      landingCorrectionLines: fuelOnlyLandingLines(),
      sources,
    });
    expect(items).toHaveLength(4);
    const missingTotal = round2(items.reduce((s, i) => s + i.missingAmount, 0));
    expect(missingTotal).toBeCloseTo(-55_321.65, 2);
    const blockers = movedBalanceItemsToCloseBlockers(items, { driverId: 'kenny', week: LANDING });
    expect(blockers.every((b) => b.code === 'MOVED_BALANCE_NOT_CARRIED')).toBe(true);
    expect(movedBalanceNotCarriedMessage('2026-02-02', -10_640.43)).toBe(
      'Week of 2 Feb: J$10,640.43 of his balance never reached this week',
    );
  });

  it('after repair: no blockers when carried_balance lines present', () => {
    const sources = KENNY_OWED_WEEKS.map(({ week, sealed }) => kennySource(week, sealed));
    const items = checkMovedBalanceCarried({
      landingWeek: LANDING,
      landingCorrectionLines: repairedLandingLines(),
      sources,
    });
    expect(items).toHaveLength(0);
  });

  it('legacy written-off week with no kept amount: skipped', () => {
    const writtenOff: MovedBalanceSourceInput = {
      periodAnchor: '2025-12-29',
      metadata: {
        financeCore: {
          balanceMovedTo: LANDING,
          legacyCleanup: 'written_off',
          legacyKeptAmount: null,
        },
      },
      balanceMovedTo: LANDING,
      liveSettlementAmount: -23_429.49,
      projectedAt: '2026-09-10T12:00:00Z',
      preFuelToolSettlement: -23_429.49,
    };
    const items = checkMovedBalanceCarried({
      landingWeek: LANDING,
      landingCorrectionLines: [],
      sources: [writtenOff],
    });
    expect(items).toHaveLength(0);
  });

  it('live half-kept legacy weeks (Dec 29, Jan 12) with no fuel line → no blocker', () => {
    const mk = (
      week: string,
      kept: number,
      live: number,
      projectedAt: string,
      row: Partial<MovedBalanceSourceInput>,
    ): MovedBalanceSourceInput => ({
      periodAnchor: week,
      metadata: { financeCore: { balanceMovedTo: LANDING, legacyCleanup: 'written_off', legacyKeptAmount: kept } },
      balanceMovedTo: LANDING,
      liveSettlementAmount: live,
      projectedAt,
      preFuelToolSettlement: live,
      earliestRevisionSettlement: null,
      revisionCreatedAt: null,
      ...row,
    });
    const items = checkMovedBalanceCarried({
      landingWeek: LANDING,
      landingCorrectionLines: [
        { sourceWeek: '2025-12-29', amount: -11714.75, sentence: '', kind: 'legacy_balance' },
        { sourceWeek: '2026-01-12', amount: 2601.61, sentence: '', kind: 'legacy_balance' },
      ],
      sources: [
        mk('2025-12-29', -11714.75, -23429.49, '2026-10-22 14:54:48+00', {
          driverShare: 26649.43, fuelDeduction: 0, fuelDriverSpend: 0, cashCollected: 59697.17, cashReturned: 5103.25,
        }),
        mk('2026-01-12', 2601.61, 5203.22, '2026-09-10 03:14:15+00', {
          driverShare: 26954.03, fuelDeduction: -2791.61, fuelDriverSpend: 5000, cashCollected: 48318.35, cashReturned: 13594.32,
        }),
      ],
    });
    expect(items).toHaveLength(0);
  });
});