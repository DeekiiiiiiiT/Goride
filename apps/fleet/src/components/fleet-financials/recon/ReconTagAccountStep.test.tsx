/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));

import { reportTagAccountSaveError } from './ReconTagAccountStep';
import { ReconApiError } from '../../../services/reconApi';
import { RECON_WEEK_CHANGED_EVENT } from '../../../services/reconWeekContext';

function capture() {
  const seen: string[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent<{ code: string }>).detail.code);
  window.addEventListener(RECON_WEEK_CHANGED_EVENT, on);
  return { seen, stop: () => window.removeEventListener(RECON_WEEK_CHANGED_EVENT, on) };
}

describe('Tag account save errors (done-test 9b)', () => {
  it('a 409 from another tab shows "This week changed", not a silent failure', () => {
    const c = capture();
    reportTagAccountSaveError(new ReconApiError('This week changed while you were working.', 409));
    c.stop();
    expect(c.seen).toEqual(['WEEK_CHANGED']);
    expect(toastError).not.toHaveBeenCalled();
  });
  it('a closed week says closed', () => {
    const c = capture();
    reportTagAccountSaveError(new ReconApiError('This week is closed. Changes go through a correction.', 409));
    c.stop();
    expect(c.seen).toEqual(['WEEK_CLOSED']);
  });
  it('any other failure tells the user', () => {
    reportTagAccountSaveError(new ReconApiError('Server error', 500));
    expect(toastError).toHaveBeenCalledWith('Server error');
  });
});
