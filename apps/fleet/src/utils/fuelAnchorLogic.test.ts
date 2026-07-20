import { describe, expect, it } from 'vitest';
import {
  SOFT_ANCHOR_THRESHOLD,
  classifyAnchor,
  resolveTankCapacity,
  mintCycleId,
  isStableCycleId,
  resolveCycleIdForOpenCycle,
  resolveNextCycleIdAfterAnchor,
} from './fuelAnchorLogic';

describe('fuelAnchorLogic', () => {
  it('locks soft threshold at 98%', () => {
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

  it('soft-closes at 98% and SPLITs excess', () => {
    const r = classifyAnchor({
      prevCumulative: 30,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isSoft).toBe(true);
    expect(r.isHard).toBe(false);
    expect(r.isAnchor).toBe(true);
    expect(r.volumeContributed).toBe(6);
    expect(r.excessVolume).toBe(4);
  });

  it('does not soft-close below 98%', () => {
    const r = classifyAnchor({
      prevCumulative: 20,
      volume: 10,
      tankCapacity: 36, // 30/36 = 83.3%
    });
    expect(r.isSoft).toBe(false);
    expect(r.isAnchor).toBe(false);
    expect(r.volumeContributed).toBe(10);
    expect(r.excessVolume).toBe(0);
  });

  it('manual Full Tank is hard even below 98%', () => {
    const r = classifyAnchor({
      isFullTank: true,
      prevCumulative: 5,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(true);
    expect(r.isSoft).toBe(false);
    expect(r.volumeContributed).toBe(10);
  });

  it('re-processes prior soft isAnchor without treating it as hard', () => {
    const r = classifyAnchor({
      isAnchor: true,
      isSoftAnchor: true,
      prevCumulative: 30,
      volume: 10,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(false);
    expect(r.isSoft).toBe(true);
  });

  it('legacy isAnchor without soft flag remains hard', () => {
    const r = classifyAnchor({
      isAnchor: true,
      prevCumulative: 5,
      volume: 5,
      tankCapacity: 36,
    });
    expect(r.isHard).toBe(true);
    expect(r.isSoft).toBe(false);
  });

  it('reimbursement-style fills are not anchors without flags', () => {
    const r = classifyAnchor({
      prevCumulative: 0,
      volume: 9.5,
      tankCapacity: 36,
    });
    expect(r.isAnchor).toBe(false);
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
