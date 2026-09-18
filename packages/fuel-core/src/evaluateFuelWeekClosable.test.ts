import { describe, expect, it } from 'vitest';
import {
  evaluateFuelWeekClosable,
  fuelWeekIsClosable,
} from './evaluateFuelWeekClosable.ts';

describe('evaluateFuelWeekClosable', () => {
  it('passes a clean week', () => {
    expect(fuelWeekIsClosable({})).toBe(true);
    expect(evaluateFuelWeekClosable({})).toEqual([]);
  });

  it('blocks exception fills (input that makes control fail)', () => {
    const b = evaluateFuelWeekClosable({ hasUnacknowledgedExceptionFills: true });
    expect(b.some((x) => x.code === 'exception_fills')).toBe(true);
  });

  it('blocks empty counts as unevaluated (C-3b)', () => {
    const b = evaluateFuelWeekClosable({ countsUnevaluated: true });
    expect(b[0]?.code).toBe('counts_unevaluated');
  });

  it('blocks over-explained and unreviewed under-explained separately', () => {
    expect(
      evaluateFuelWeekClosable({ overExplained: true }).map((x) => x.code),
    ).toContain('over_explained');
    expect(
      evaluateFuelWeekClosable({ underExplainedUnreviewed: true }).map((x) => x.code),
    ).toContain('under_explained_unreviewed');
  });

  it('blocks degraded money inputs (F-5)', () => {
    expect(
      evaluateFuelWeekClosable({ degradedInputs: true }).map((x) => x.code),
    ).toContain('degraded_inputs');
  });

  it('blocks on stop-to-stop conservation failures', () => {
    expect(
      evaluateFuelWeekClosable({ stopToStopVolumeFailed: true }).map((x) => x.code),
    ).toContain('stop_to_stop_volume');
    expect(
      evaluateFuelWeekClosable({ stopToStopTripsTruncated: true }).map((x) => x.code),
    ).toContain('stop_to_stop_trips_truncated');
  });

  it('blocks N-1 thin odometer chain', () => {
    expect(
      evaluateFuelWeekClosable({ odometerChainUnusable: true }).map((x) => x.code),
    ).toContain('odometer_chain_unusable');
  });

  it('R-2: thin chain signal cleared when not flagged (reviewed by caller)', () => {
    expect(evaluateFuelWeekClosable({ odometerChainUnusable: false })).toEqual([]);
  });

  it('blocks N-2 unattributed fills unreviewed', () => {
    expect(
      evaluateFuelWeekClosable({ unattributedUnreviewed: true }).map((x) => x.code),
    ).toContain('unattributed_unreviewed');
  });

  it('R-1: unattributed reviewed clears blocker', () => {
    expect(evaluateFuelWeekClosable({ unattributedUnreviewed: false })).toEqual([]);
  });

  it('blocks undisposed critical fill flags', () => {
    expect(
      evaluateFuelWeekClosable({ undisposedCriticalFlags: true }).map((x) => x.code),
    ).toContain('undisposed_flags');
  });

  it('clears when undisposedCriticalFlags is false', () => {
    expect(evaluateFuelWeekClosable({ undisposedCriticalFlags: false })).toEqual([]);
  });

  it('blocks data-quality vehicles unreviewed', () => {
    expect(
      evaluateFuelWeekClosable({ dataQualityVehiclesUnreviewed: true }).map((x) => x.code),
    ).toContain('data_quality_unreviewed');
  });
});
