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
});
