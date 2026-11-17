import { describe, expect, it } from 'vitest';
import {
  carriedBalanceCorrectionAmount,
  resolveSealedResidualSettlement,
  sumCorrectionLines,
  weekExcludedFromCarriedBalance,
  type CorrectionLine,
} from './fuelShareCorrection';
import { deriveDirectionalSettlementStatus } from './settlementStatusRepair';

const KENNY_OWED_WEEKS: Array<{ week: string; sealed: number; fuelShare: number }> = [
  { week: '2026-02-02', sealed: -10_640.43, fuelShare: 7_316.23 },
  { week: '2026-02-09', sealed: -17_961.09, fuelShare: 7_316.23 },
  { week: '2026-02-23', sealed: -14_690.46, fuelShare: 7_316.23 },
  { week: '2026-03-02', sealed: -12_029.67, fuelShare: 7_316.23 },
];

const DRIFT_RESTORE_WEEKS = [
  '2026-02-16',
  '2026-05-04',
  '2026-06-29',
  '2026-07-13',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-24',
];

describe('WRA-62 Kenny carried balance (live audited numbers)', () => {
  it('server shape: no revision comes back as null, not 0 (live Feb 2)', () => {
    expect(
      resolveSealedResidualSettlement({
        metadata: { financeCore: { balanceMovedTo: '2026-10-19' } },
        liveSettlementAmount: -10_640.43,
        balanceMovedTo: '2026-10-19',
        earliestRevisionSettlement: null,
        revisionCreatedAt: null,
        preFuelToolSettlement: -10_640.43,
        projectedAt: '2026-09-10 01:48:44.578+00',
      }),
    ).toBe(-10_640.43);
    expect(
      resolveSealedResidualSettlement({
        metadata: {},
        liveSettlementAmount: 9_020.63,
        balanceMovedTo: '2026-10-19',
        earliestRevisionSettlement: null,
        revisionCreatedAt: null,
        preFuelToolSettlement: null,
        projectedAt: '2026-11-08 12:33:35+00',
      }),
    ).toBeNaN();
  });

  it('resolves sealed residual from pre-fuel projected rows without snapshot', () => {
    for (const { week, sealed } of KENNY_OWED_WEEKS) {
      const v = resolveSealedResidualSettlement({
        metadata: {},
        liveSettlementAmount: sealed,
        balanceMovedTo: '2026-10-19',
        projectedAt: '2026-09-10T12:00:00Z',
      });
      expect(v, week).toBeCloseTo(sealed, 2);
    }
  });

  it('posts carried_balance lines only for the four owed weeks', () => {
    const openFuelLines: CorrectionLine[] = KENNY_OWED_WEEKS.map(({ week, fuelShare }) => ({
      sourceWeek: week,
      amount: fuelShare,
      sentence: '',
      kind: 'fuel_share',
    }));
    const carried: CorrectionLine[] = [];
    for (const { week, sealed, fuelShare } of KENNY_OWED_WEEKS) {
      const amount = carriedBalanceCorrectionAmount(
        sealed,
        fuelShare,
        openFuelLines.filter((l) => l.sourceWeek === week),
      );
      expect(amount, week).toBeCloseTo(sealed, 2);
      carried.push({
        sourceWeek: week,
        amount,
        sentence: '',
        kind: 'carried_balance',
      });
    }
    expect(sumCorrectionLines(carried)).toBeCloseTo(-55_321.65, 2);
    expect(carried).toHaveLength(4);
  });

  it('merges carried lines into postedAdjustments and landing settlement', () => {
    const existingPosted = 44_710.13;
    const currentLanding = 53_697.75;
    const carriedTotal = -55_321.65;
    const newPosted = existingPosted + carriedTotal;
    const newLanding = currentLanding + carriedTotal;
    expect(newPosted).toBeCloseTo(-10_611.52, 2);
    expect(newLanding).toBeCloseTo(-1_623.9, 2);
    expect(deriveDirectionalSettlementStatus(newLanding)).toBe('driver_owes');
  });

  it('this week base unchanged when corrections grow', () => {
    const landing = 53_697.75;
    const posted = 44_710.13;
    const thisWeek = landing - posted;
    expect(thisWeek).toBeCloseTo(8_987.62, 2);
    const afterPosted = -10_611.52;
    expect(thisWeek + afterPosted).toBeCloseTo(-1_623.9, 2);
  });

  it('never carries legacyCleanup weeks', () => {
    expect(weekExcludedFromCarriedBalance({ legacyCleanup: 'written_off' })).toBe(true);
    expect(weekExcludedFromCarriedBalance({ legacyCleanup: 'carried' })).toBe(true);
    expect(weekExcludedFromCarriedBalance({})).toBe(false);
    for (const week of ['2025-12-29', '2026-01-12']) {
      const sealed = resolveSealedResidualSettlement({
        metadata: { financeCore: { legacyCleanup: 'written_off' } },
        liveSettlementAmount: -11_714.74,
        balanceMovedTo: '2026-10-19',
        projectedAt: '2026-09-10T12:00:00Z',
      });
      expect(sealed, week).toBeCloseTo(-11_714.74, 2);
      expect(weekExcludedFromCarriedBalance({ legacyCleanup: 'written_off' })).toBe(true);
    }
  });

  it('settled-at-zero week carries no extra carried_balance after fuel fix only', () => {
    const amount = carriedBalanceCorrectionAmount(0, -7_040.65, [
      { sourceWeek: '2026-08-03', amount: -7_040.65, sentence: '', kind: 'fuel_share' },
    ]);
    expect(Math.abs(amount)).toBeLessThanOrEqual(0.01);
  });

  it('drift restore weeks seal at zero via signedSnapshot', () => {
    for (const week of DRIFT_RESTORE_WEEKS) {
      const sealed = resolveSealedResidualSettlement({
        metadata: { signedSnapshot: { settlement_amount: 0 } },
        liveSettlementAmount: -7_040.65,
        balanceMovedTo: '2026-10-19',
      });
      expect(sealed, week).toBeCloseTo(0, 2);
    }
  });

  it('sumCorrectionLines on merged fuel + carried matches audited posted total', () => {
    const carried: CorrectionLine[] = KENNY_OWED_WEEKS.map(({ week, sealed }) => ({
      sourceWeek: week,
      amount: sealed,
      sentence: '',
      kind: 'carried_balance',
    }));
    const priorFuelAndLegacy: CorrectionLine[] = [{ sourceWeek: '2026-01-19', amount: 44_710.13, sentence: '', kind: 'fuel_share' }];
    const merged = [...priorFuelAndLegacy, ...carried];
    expect(sumCorrectionLines(merged)).toBeCloseTo(-10_611.52, 2);
  });
});