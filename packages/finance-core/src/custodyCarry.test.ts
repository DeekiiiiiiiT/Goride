import { describe, expect, it } from 'vitest';
import {
  CUSTODY_ERROR_CODES,
  CUSTODY_TARGET_HORIZON_WEEKS,
  PRIOR_CLOSE_HASH_CHANGED,
  clearCustodyTransferMarks,
  custodyCarryAlreadyLanded,
  custodyTargetWeekCandidates,
  mergeOpeningCashCustody,
  openingCustodyAfterReverse,
  pickFirstOpenCustodyTargetFromMap,
  priorCloseHashChanged,
  readCustodyTransferMarks,
  residualCustodyHeld,
} from './custodyCarry';
import { nextPeriodAnchor } from './periodKey';

describe('custodyCarry (Pass 4 N-1 / N-2)', () => {
  it('N-2: candidates walk N+7 then N+14 (skips frozen at call site)', () => {
    const weeks = custodyTargetWeekCandidates('2026-08-24', 3);
    expect(weeks[0]).toBe('2026-08-31');
    expect(weeks[1]).toBe('2026-09-07');
    expect(weeks[2]).toBe('2026-09-14');
    expect(weeks).toHaveLength(3);
  });

  it('N-2: default horizon is 52 weeks', () => {
    expect(custodyTargetWeekCandidates('2026-01-05')).toHaveLength(CUSTODY_TARGET_HORIZON_WEEKS);
  });

  it('P-6: pickFirstOpen skips frozen weeks then lands on first open', () => {
    const after = '2026-08-24';
    const candidates = custodyTargetWeekCandidates(after, 5);
    const frozenByAnchor = new Map<string, boolean>([
      [candidates[0], true],
      [candidates[1], true],
      [candidates[2], true],
      [candidates[3], false],
    ]);
    const picked = pickFirstOpenCustodyTargetFromMap({ afterWeekKey: after, frozenByAnchor, horizon: 5 });
    expect(picked).toEqual({ targetWeek: candidates[3], exists: true });
  });

  it('P-6: missing next Monday is an open stub (even if later weeks exist)', () => {
    const after = '2026-08-24';
    const candidates = custodyTargetWeekCandidates(after, 4);
    // Gap at N+7; only N+21 present and open — sequential walk still stubs N+7.
    const frozenByAnchor = new Map<string, boolean>([[candidates[2], false]]);
    const picked = pickFirstOpenCustodyTargetFromMap({ afterWeekKey: after, frozenByAnchor, horizon: 4 });
    expect(picked).toEqual({ targetWeek: candidates[0], exists: false });
  });

  it('P-6: ranged candidate list matches sequential Monday walk for fixed horizon', () => {
    const after = '2026-01-05';
    const horizon = 12;
    const candidates = custodyTargetWeekCandidates(after, horizon);
    // Simulate old sequential: first 7 frozen, 8th missing → stub, rest irrelevant.
    const frozenByAnchor = new Map<string, boolean>();
    for (let i = 0; i < 7; i++) frozenByAnchor.set(candidates[i], true);
    let sequential: { targetWeek: string; exists: boolean } | null = null;
    for (const week of candidates) {
      if (!frozenByAnchor.has(week)) {
        sequential = { targetWeek: week, exists: false };
        break;
      }
      if (frozenByAnchor.get(week)) continue;
      sequential = { targetWeek: week, exists: true };
      break;
    }
    const ranged = pickFirstOpenCustodyTargetFromMap({ afterWeekKey: after, frozenByAnchor, horizon });
    expect(ranged).toEqual(sequential);
    expect(ranged?.targetWeek).toBe(candidates[7]);
    expect(ranged?.exists).toBe(false);
  });

  it('P-6: all frozen in horizon returns null', () => {
    const after = '2026-08-24';
    const candidates = custodyTargetWeekCandidates(after, 3);
    const frozenByAnchor = new Map(candidates.map((w) => [w, true] as const));
    expect(pickFirstOpenCustodyTargetFromMap({ afterWeekKey: after, frozenByAnchor, horizon: 3 })).toBeNull();
  });

  it('N-1: reverse subtracts opening and floors at zero', () => {
    expect(openingCustodyAfterReverse(61154.3, 20000)).toBe(41154.3);
    expect(openingCustodyAfterReverse(100, 500)).toBe(0);
  });

  it('N-1: clear transfer marks leaves other financeCore keys', () => {
    const cleared = clearCustodyTransferMarks({
      openingCashCustody: 10,
      custodyTransferredTo: '2026-09-07',
      custodyTransferredAmount: 50,
      periodFrozen: false,
    });
    expect(cleared.custodyTransferredTo).toBeUndefined();
    expect(cleared.custodyTransferredAmount).toBeUndefined();
    expect(cleared.openingCashCustody).toBe(10);
  });

  it('mergeOpeningCashCustody accumulates', () => {
    const fc = mergeOpeningCashCustody({ tips: 1 }, 100, '2026-08-24');
    expect(fc.openingCashCustody).toBe(100);
    expect(fc.custodyReceivedFrom).toBe('2026-08-24');
    const again = mergeOpeningCashCustody(fc, 50.5, '2026-08-31');
    expect(again.openingCashCustody).toBe(150.5);
  });

  it('readCustodyTransferMarks', () => {
    expect(readCustodyTransferMarks({})).toEqual({ transferredTo: null, transferredAmount: 0 });
    expect(
      readCustodyTransferMarks({
        custodyTransferredTo: '2026-09-07',
        custodyTransferredAmount: 12.34,
      }),
    ).toEqual({ transferredTo: '2026-09-07', transferredAmount: 12.34 });
  });

  it('error code contracts stay stable for clients', () => {
    expect(CUSTODY_ERROR_CODES.NO_OPEN_TARGET).toBe('CUSTODY_NO_OPEN_TARGET');
    expect(CUSTODY_ERROR_CODES.SUCCESSOR_FROZEN).toBe('REOPEN_CUSTODY_SUCCESSOR_FROZEN');
    expect(PRIOR_CLOSE_HASH_CHANGED).toBe('PRIOR_CLOSE_HASH_CHANGED');
    expect(nextPeriodAnchor('2026-08-31')).toBe('2026-09-07');
  });

  it('N-3: residualCustodyHeld ignores noise below eps', () => {
    expect(residualCustodyHeld(0)).toBe(0);
    expect(residualCustodyHeld(0.001)).toBe(0);
    expect(residualCustodyHeld(7185.97)).toBe(7185.97);
  });

  it('N-3: custodyCarryAlreadyLanded requires marks + successor opening', () => {
    expect(custodyCarryAlreadyLanded({}, 100)).toBe(false);
    expect(
      custodyCarryAlreadyLanded(
        { custodyTransferredTo: '2026-09-07', custodyTransferredAmount: 50 },
        0,
      ),
    ).toBe(false);
    expect(
      custodyCarryAlreadyLanded(
        { custodyTransferredTo: '2026-09-07', custodyTransferredAmount: 50 },
        553690.18,
      ),
    ).toBe(true);
  });

  it('H-3: priorCloseHashChanged is warn-contract only', () => {
    expect(priorCloseHashChanged(null, 'abc')).toBe(false);
    expect(priorCloseHashChanged('abc', 'abc')).toBe(false);
    expect(priorCloseHashChanged('abc', 'def')).toBe(true);
  });
});
