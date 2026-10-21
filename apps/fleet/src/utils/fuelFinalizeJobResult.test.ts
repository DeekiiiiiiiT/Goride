import { describe, expect, it } from 'vitest';
import { interpretFuelFinalizeJobResult } from './fuelFinalizeJobResult';

describe('interpretFuelFinalizeJobResult (NEW-7)', () => {
  it('treats full success as complete', () => {
    const r = interpretFuelFinalizeJobResult({ state: 'succeeded', ok: true, failures: [] });
    expect(r.incomplete).toBe(false);
    expect(r.toastMessage).toBe('');
    expect(r.successMessage).toBe('Week locked. This week is completed.');
  });

  it('counts posted statements from the driver list, then progress_done', () => {
    const fromList = interpretFuelFinalizeJobResult({
      state: 'succeeded',
      ok: true,
      failures: [],
      driversDone: ['d1', 'd2'],
      progress_done: 9,
    });
    expect(fromList.successMessage).toBe(
      'Week locked. 2 driver statements posted. This week is completed.',
    );
    const fromCursor = interpretFuelFinalizeJobResult({
      state: 'succeeded',
      ok: true,
      cursor: { completedDriverIds: ['d1'] },
    });
    expect(fromCursor.successMessage).toBe(
      'Week locked. 1 driver statement posted. This week is completed.',
    );
    const fromProgress = interpretFuelFinalizeJobResult({
      state: 'succeeded',
      ok: true,
      progress_done: 4,
    });
    expect(fromProgress.driversDoneCount).toBe(4);
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

  it('treats a job that is still locking as incomplete', () => {
    const r = interpretFuelFinalizeJobResult({ state: 'queued', ok: true, failures: [] });
    expect(r.incomplete).toBe(true);
    expect(r.toastMessage).toMatch(/Still locking/);
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
