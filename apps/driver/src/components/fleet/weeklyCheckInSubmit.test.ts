import { describe, expect, it } from 'vitest';

/** Mirrors WeeklyCheckInModal.runSubmit step recovery. */
async function modalRunSubmit(onSubmit: () => Promise<void>): Promise<'SUBMITTING' | 'CONFIRM_AI'> {
  try {
    await onSubmit();
    return 'SUBMITTING';
  } catch {
    return 'CONFIRM_AI';
  }
}

/** Current DriverShell.handleWeeklyCheckInSubmit error handling. */
async function shellSubmitSwallows(submitCheckIn: () => Promise<void>) {
  try {
    await submitCheckIn();
  } catch {
    // toast only — error is not rethrown
  }
}

/** Fixed shell handler — errors propagate to the modal. */
async function shellSubmitRethrows(submitCheckIn: () => Promise<void>) {
  try {
    await submitCheckIn();
  } catch (e) {
    throw e;
  }
}

describe('weekly check-in submit error propagation', () => {
  it('leaves modal on SUBMITTING when the shell swallows a failed save (bug)', async () => {
    const failingSave = () => Promise.reject(new Error('Photo upload failed'));

    const step = await modalRunSubmit(() => shellSubmitSwallows(failingSave));
    expect(step).toBe('SUBMITTING');
  });

  it('returns modal to CONFIRM_AI when the shell rethrows a failed save (fix)', async () => {
    const failingSave = () => Promise.reject(new Error('Photo upload failed'));

    const step = await modalRunSubmit(() => shellSubmitRethrows(failingSave));
    expect(step).toBe('CONFIRM_AI');
  });

  it('closes normally when save succeeds', async () => {
    const okSave = () => Promise.resolve();

    const stepAfterSuccess = await modalRunSubmit(() => shellSubmitRethrows(okSave));
    expect(stepAfterSuccess).toBe('SUBMITTING');
  });
});
