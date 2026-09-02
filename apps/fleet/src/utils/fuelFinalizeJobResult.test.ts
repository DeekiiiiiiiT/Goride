import { describe, expect, it } from 'vitest';
import { interpretFuelFinalizeJobResult } from './fuelFinalizeJobResult';

describe('interpretFuelFinalizeJobResult (NEW-7)', () => {
  it('treats full success as complete', () => {
    const r = interpretFuelFinalizeJobResult({ state: 'succeeded', ok: true, failures: [] });
    expect(r.incomplete).toBe(false);
    expect(r.toastMessage).toBe('');
  });

  it('treats partial failures as incomplete even if some drivers done', () => {
    const r = interpretFuelFinalizeJobResult({
      state: 'failed',
      ok: false,
      error: 'partial_finalize_failure',
      failures: [{ driverId: 'd2', error: 'wallet' }],
      driversDone: ['d1', 'd3'],
    });
    expect(r.incomplete).toBe(true);
    expect(r.driversDoneCount).toBe(2);
    expect(r.toastMessage).toMatch(/2 settled, 1 failed/);
    expect(r.toastMessage).toMatch(/stays open/);
  });

  it('treats failures array alone as incomplete', () => {
    const r = interpretFuelFinalizeJobResult({
      state: 'succeeded',
      failures: [{ driverId: 'x', error: 'boom' }],
    });
    expect(r.incomplete).toBe(true);
  });

  it('all-fail without driversDone still incomplete', () => {
    const r = interpretFuelFinalizeJobResult({
      state: 'failed',
      error: 'all_drivers_failed',
      failures: [],
    });
    expect(r.incomplete).toBe(true);
    expect(r.toastMessage).toMatch(/not locked/);
  });
});
