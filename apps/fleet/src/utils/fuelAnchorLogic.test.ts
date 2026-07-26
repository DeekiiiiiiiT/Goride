import { describe, expect, it } from 'vitest';
import {
  SOFT_ANCHOR_THRESHOLD,
  classifyAnchor,
  resolveTankCapacity,
  mintCycleId,
  isStableCycleId,
  resolveCycleIdForOpenCycle,
  resolveNextCycleIdAfterAnchor,
  isNonTankCycleEntry,
} from './fuelAnchorLogic';

describe('fuelAnchorLogic', () => {
  it('locks capacity threshold at 98%', () => {
    expect(SOFT_ANCHOR_THRESHOLD).toBe(0.98);
  });

  it('resolveTankCapacity prefers specifications over fuelSettings', () => {
    expect(
      resolveTankCapacity({
        specifications: { tankCapacity: 36 },
        fuelSettings: { tankCapacity: 40 },
      }),
    ).toBe(36);
    expect(resolveTankCapacity({ fuelSettings: { tankCapacity: 40 } })).toBe(40);
    expect(resolveTankCapacity({})).toBe(0);
  });

  it('capacity-closes at 98% and SPLITs excess', () => {
    const r = classifyAnchor({
      prevCumulative: 30,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isCapacityClose).toBe(true);
    expect(r.isSoft).toBe(true);
    expect(r.isHard).toBe(false);
    expect(r.isAnchor).toBe(true);
    expect(r.volumeContributed).toBe(6);
    expect(r.excessVolume).toBe(4);
  });

  it('does not close below 98%', () => {
    const r = classifyAnchor({
      prevCumulative: 20,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isCapacityClose).toBe(false);
    expect(r.isSoft).toBe(false);
    expect(r.isAnchor).toBe(false);
    expect(r.volumeContributed).toBe(10);
    expect(r.excessVolume).toBe(0);
  });

  it('ignores driver Full Tank below 98% (no hard close)', () => {
    const r = classifyAnchor({
      isFullTank: true,
      prevCumulative: 5,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(false);
    expect(r.isCapacityClose).toBe(false);
    expect(r.isAnchor).toBe(false);
    expect(r.volumeContributed).toBe(10);
  });

  it('ignores legacy isAnchor hard flags', () => {
    const r = classifyAnchor({
      isAnchor: true,
      prevCumulative: 5,
      volume: 5,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(false);
    expect(r.isCapacityClose).toBe(false);
  });

  it('top-up series closes only when cumulative hits capacity', () => {
    const tank = 36;
    let cum = 0;
    const fills = [9, 9, 9, 9]; // 36L on 4th
    const results = fills.map((volume) => {
      const r = classifyAnchor({ prevCumulative: cum, volume, tankCapacity: tank });
      if (r.isCapacityClose) {
        cum = r.excessVolume;
      } else {
        cum = r.totalVolumeInCycle;
      }
      return r;
    });
    expect(results[0].isCapacityClose).toBe(false);
    expect(results[1].isCapacityClose).toBe(false);
    expect(results[2].isCapacityClose).toBe(false);
    expect(results[3].isCapacityClose).toBe(true);
    expect(results[3].volumeContributed).toBe(9);
    expect(results[3].excessVolume).toBe(0);
  });

  it('expense-backed Reimbursement type still capacity-closes (Roam model)', () => {
    expect(isNonTankCycleEntry('Reimbursement')).toBe(false);
    const r = classifyAnchor({
      entryType: 'Reimbursement',
      prevCumulative: 30,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isCapacityClose).toBe(true);
    expect(r.excessVolume).toBe(4);
  });

  it('ignores stale isHardAnchor metadata on expense fills', () => {
    const r = classifyAnchor({
      entryType: 'Reimbursement',
      isHardAnchor: true,
      isFullTank: true,
      prevCumulative: 30,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(false);
    expect(r.isCapacityClose).toBe(true);
    expect(r.volumeContributed).toBe(6);
  });

  it('mintCycleId returns a stable UUID', () => {
    const id = mintCycleId();
    expect(isStableCycleId(id)).toBe(true);
  });

  it('resolveCycleIdForOpenCycle reuses open-cycle UUID', () => {
    const openId = mintCycleId();
    expect(
      resolveCycleIdForOpenCycle([{ metadata: { cycleId: openId } }, { metadata: {} }]),
    ).toBe(openId);
  });

  it('resolveNextCycleIdAfterAnchor prefers next fill UUID', () => {
    const closed = mintCycleId();
    const next = mintCycleId();
    expect(resolveNextCycleIdAfterAnchor({ metadata: { cycleId: next } }, closed)).toBe(next);
    expect(resolveNextCycleIdAfterAnchor({ metadata: { cycleId: closed } }, closed)).not.toBe(closed);
  });
});
