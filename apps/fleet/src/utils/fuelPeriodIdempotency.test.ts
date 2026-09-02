import { describe, expect, it } from 'vitest';
import {
  fuelPeriodFinalizeIdempotencyKey,
  fuelPeriodReopenIdempotencyKey,
} from './fuelPeriodIdempotency';

describe('fuelPeriodIdempotency (NEW-5)', () => {
  it('uses stable finalize key without Date.now', () => {
    const a = fuelPeriodFinalizeIdempotencyKey('org:2026-07-06', 3);
    const b = fuelPeriodFinalizeIdempotencyKey('org:2026-07-06', 3);
    expect(a).toBe('finalize:org:2026-07-06:v3');
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{13}/);
  });

  it('bumps key when version changes', () => {
    expect(fuelPeriodFinalizeIdempotencyKey('p', 1)).not.toBe(
      fuelPeriodFinalizeIdempotencyKey('p', 2),
    );
  });

  it('builds reopen key', () => {
    expect(fuelPeriodReopenIdempotencyKey('p', 4)).toBe('reopen:p:v4');
  });
});
