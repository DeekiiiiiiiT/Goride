import { describe, expect, it } from 'vitest';
import { RECON_STEP_ORDER } from './evaluateRun.ts';
import {
  CHECK_CLOSE_INVARIANT_BLOCK_CODES,
  SERVER_STEP_BY_BLOCKER,
  countBlockersForStep,
  serverStepForBlockerCode,
} from './closeBlockerSteps.ts';
import {
  SETTLEMENT_PREVIEW_BLOCKER_CODES,
  TRIPS_EARNINGS_BLOCKER_CODES,
} from './coverageInputHash.ts';

describe('close blocker step map (R10-02)', () => {
  it('counts every blocking close code on exactly one server step', () => {
    const seen = new Map<string, string>();
    for (const code of CHECK_CLOSE_INVARIANT_BLOCK_CODES) {
      const step = serverStepForBlockerCode(code);
      expect(step, code).toBeTruthy();
      expect(RECON_STEP_ORDER).toContain(step);
      expect(seen.has(code), code).toBe(false);
      seen.set(code, step!);
    }
    expect(seen.size).toBe(CHECK_CLOSE_INVARIANT_BLOCK_CODES.length);
  });

  it('does not require warn-only codes to count as open work', () => {
    for (const code of ['BUSINESS_WEEK_PNL_UNAVAILABLE', 'SOURCE_WAIVED', 'SOURCE_ATTESTED_NONE']) {
      expect(CHECK_CLOSE_INVARIANT_BLOCK_CODES).not.toContain(code);
      expect(SERVER_STEP_BY_BLOCKER[code]).toBeTruthy();
    }
  });

  it('derives trips and settlement lists from the same map', () => {
    expect([...TRIPS_EARNINGS_BLOCKER_CODES].sort()).toEqual(
      Object.entries(SERVER_STEP_BY_BLOCKER)
        .filter(([, step]) => step === 'trips_earnings')
        .map(([code]) => code)
        .sort(),
    );
    expect([...SETTLEMENT_PREVIEW_BLOCKER_CODES].sort()).toEqual(
      Object.entries(SERVER_STEP_BY_BLOCKER)
        .filter(([, step]) => step === 'settlement_preview')
        .map(([code]) => code)
        .sort(),
    );
  });

  it('ignores warnings when counting a step', () => {
    expect(
      countBlockersForStep('close', [
        { code: 'SETTLEMENT_PNL_MISMATCH', severity: 'block' },
        { code: 'BUSINESS_WEEK_PNL_UNAVAILABLE', severity: 'warn' },
        { code: 'FUEL_STATEMENT_MISSING', severity: 'block' },
      ]),
    ).toBe(1);
    expect(
      countBlockersForStep('fuel', [{ code: 'FUEL_STATEMENT_MISSING', severity: 'block' }]),
    ).toBe(1);
  });
});
