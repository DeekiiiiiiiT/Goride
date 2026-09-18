/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import { listExceptionTierFillBlockers } from './fuelFinalizeGating';
import { dispositionMapFromRows } from './fuelFlagDisposition';
import { classifyFuelFillFlags } from './fuelFillFlagClassify';
import { buildFuelWeekClosableInput } from './fuelWeekClosableGate';
import { evaluateFuelWeekClosable } from '@roam/fuel-core';

function entry(partial: Partial<FuelEntry> & { id: string; date: string }): FuelEntry {
  return {
    amount: 100,
    type: 'Reimbursement',
    entryMode: 'Floating',
    paymentSource: 'RideShare_Cash',
    ...partial,
  } as FuelEntry;
}

describe('disposition sync desk ↔ wizard blockers', () => {
  it('accept disposition clears exception blocker without signalTier mutation', () => {
    const fill = entry({
      id: 'ex1',
      date: '2026-09-10',
      metadata: { signalTier: 'exception', anomalyReason: 'Tank Overflow' },
    });
    expect(listExceptionTierFillBlockers([fill], '2026-09-07', '2026-09-13')).toHaveLength(1);

    const dispositions = dispositionMapFromRows([
      { entryId: 'ex1', flagCode: 'signal_exception', action: 'accepted', note: 'Reviewed OK' },
    ]);
    expect(
      listExceptionTierFillBlockers([fill], '2026-09-07', '2026-09-13', dispositions),
    ).toHaveLength(0);

    const c = classifyFuelFillFlags(fill, { dispositions });
    expect(c.hasOpenCritical).toBe(false);
    expect(c.reasons[0]?.resolved).toBe(true);
    expect(fill.metadata?.signalTier).toBe('exception');
  });

  it('bulk finalize closable input refuses when DQ vehicles unreviewed', () => {
    const input = buildFuelWeekClosableInput({
      gateResult: {
        hasExceptionBlockers: false,
        exceptionBlockers: [],
        hasUnapprovedFuelTxBlockers: false,
        hasOverExplainedBlockers: false,
        hasUnderExplainedBlockers: false,
      },
      reports: [],
      scenarios: [],
      leakageReviewed: true,
      dataQualityVehiclesUnreviewed: true,
    });
    const blockers = evaluateFuelWeekClosable(input);
    expect(blockers.some((b) => b.code === 'data_quality_unreviewed')).toBe(true);
  });

  it('wizard and bulk share undisposed_flags when critical open', () => {
    const input = buildFuelWeekClosableInput({
      gateResult: {
        hasExceptionBlockers: true,
        exceptionBlockers: [{ id: '1' } as any],
        hasUnapprovedFuelTxBlockers: false,
        hasOverExplainedBlockers: false,
        hasUnderExplainedBlockers: false,
      },
      reports: [],
      scenarios: [],
      leakageReviewed: true,
    });
    const blockers = evaluateFuelWeekClosable(input);
    expect(blockers.some((b) => b.code === 'undisposed_flags')).toBe(true);
    expect(blockers.some((b) => b.code === 'exception_fills')).toBe(false);
  });
});
