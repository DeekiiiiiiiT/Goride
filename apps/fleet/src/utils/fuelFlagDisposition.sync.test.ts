/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';
import {
  assembleFuelClientFinalizeGate,
  listExceptionTierFillBlockers,
} from './fuelFinalizeGating';
import { dispositionMapFromRows } from './fuelFlagDisposition';
import { classifyFuelFillFlags, resolveOpenFlagCodeForAccept } from './fuelFillFlagClassify';
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

function stubReport(weekStart = '2026-09-07', weekEnd = '2026-09-13'): WeeklyFuelReport {
  return {
    driverId: 'd1',
    vehicleId: 'v1',
    weekStart,
    weekEnd,
    driverShare: 0,
    totalGasCardCost: 0,
    miscellaneousCost: 0,
  } as WeeklyFuelReport;
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

  /**
   * Wiring-level (R-1): must use assembleFuelClientFinalizeGate — the same helper
   * useFuelWizardDerived calls — so omitting dispositions from production is a call-site bug.
   */
  it('wizard gate assembly clears integrity_critical when desk disposition is threaded', () => {
    const fill = entry({
      id: 'ic1',
      date: '2026-09-10',
      metadata: { integrityStatus: 'critical', anomalyReason: 'Odometer jump' },
    });
    const openGate = assembleFuelClientFinalizeGate({
      reports: [stubReport()],
      fuelEntries: [fill],
      weekStartYmd: '2026-09-07',
      weekEndYmd: '2026-09-13',
      dispositions: undefined,
    });
    expect(openGate.hasExceptionBlockers).toBe(true);

    const dispositions = dispositionMapFromRows([
      {
        entryId: 'ic1',
        flagCode: 'integrity_critical',
        action: 'accepted',
        note: 'Desk accepted — verified GPS',
      },
    ]);
    const cleared = assembleFuelClientFinalizeGate({
      reports: [stubReport()],
      fuelEntries: [fill],
      weekStartYmd: '2026-09-07',
      weekEndYmd: '2026-09-13',
      dispositions,
    });
    expect(cleared.hasExceptionBlockers).toBe(false);
    expect(cleared.exceptionBlockers).toHaveLength(0);
  });

  it('wrong-code signal_exception disposition does not clear integrity_critical', () => {
    const fill = entry({
      id: 'ic2',
      date: '2026-09-10',
      metadata: { integrityStatus: 'critical', anomalyReason: 'Odometer jump' },
    });
    expect(resolveOpenFlagCodeForAccept(fill)).toBe('integrity_critical');

    const wrongCode = dispositionMapFromRows([
      { entryId: 'ic2', flagCode: 'signal_exception', action: 'accepted', note: 'Wrong code' },
    ]);
    const gate = assembleFuelClientFinalizeGate({
      reports: [stubReport()],
      fuelEntries: [fill],
      weekStartYmd: '2026-09-07',
      weekEndYmd: '2026-09-13',
      dispositions: wrongCode,
    });
    expect(gate.hasExceptionBlockers).toBe(true);
    expect(resolveOpenFlagCodeForAccept(fill, wrongCode)).toBe('integrity_critical');
  });
});
