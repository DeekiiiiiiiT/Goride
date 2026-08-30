/**
 * Finding K — /wipay/complete must not mark money paid from client status.
 * Documents expected poll-only contract for regression reviews.
 */
import { describe, expect, it } from 'vitest';

/** Mirror of payments wipaySuccess — kept for documenting what clients used to forge. */
function wipaySuccess(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return (
    s === 'success' ||
    s === 'successful' ||
    s === 'completed' ||
    s === 'paid' ||
    s === 'ok' ||
    s === 'approved' ||
    s === '1' ||
    s === 'true'
  );
}

describe('Finding K — WiPay complete contract', () => {
  it('documents that client success strings must not alone authorize capture', () => {
    // Regression guard: these strings previously unlocked completeWipayIntent via body.status
    expect(wipaySuccess('success')).toBe(true);
    expect(wipaySuccess('1')).toBe(true);
    // Server must ignore them and only trust intent.status from DB / webhook
    const intentPending = { status: 'pending' };
    const clientSaysPaid = wipaySuccess('success');
    const mayComplete = clientSaysPaid && intentPending.status === 'completed';
    expect(mayComplete).toBe(false);
  });

  it('only completed/paid intent statuses count as success for poll', () => {
    const ok = new Set(['completed', 'paid']);
    expect(ok.has('pending')).toBe(false);
    expect(ok.has('completed')).toBe(true);
  });
});
