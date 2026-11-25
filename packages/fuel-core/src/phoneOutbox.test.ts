import { describe, expect, it } from 'vitest';
import {
  afterFailedTry,
  buildOutboxReport,
  isOutboxItemDue,
  nextRetryDelayMs,
  plainSendError,
  withTimeout,
  OutboxTimeoutError,
} from './phoneOutbox.ts';

const NOW = Date.parse('2026-11-25T12:10:00Z');

describe('phone outbox retries (FO-06)', () => {
  it('waits 1, 5, 15, 60 minutes, then stays hourly — never gives up', () => {
    expect([1, 2, 3, 4, 5, 50].map(nextRetryDelayMs)).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 3_600_000, 3_600_000,
    ]);
  });

  it('a failed try counts and sets the next time', () => {
    const next = afterFailedTry({ timestamp: NOW, retryCount: 2 }, 'Failed to fetch', NOW);
    expect(next.retryCount).toBe(3);
    expect(next.nextAttemptAt).toBe(NOW + 900_000);
    expect(next.lastError).toBe('Failed to fetch');
  });
});

describe('when an item is due (FO-08)', () => {
  it('is due with no wait set, or once the wait has passed', () => {
    expect(isOutboxItemDue({ timestamp: NOW }, NOW)).toBe(true);
    expect(isOutboxItemDue({ timestamp: NOW, nextAttemptAt: NOW + 1 }, NOW)).toBe(false);
    expect(isOutboxItemDue({ timestamp: NOW, nextAttemptAt: NOW }, NOW)).toBe(true);
  });

  it('Send now skips the wait but never a hold', () => {
    expect(isOutboxItemDue({ timestamp: NOW, nextAttemptAt: NOW + 999 }, NOW, true)).toBe(true);
    expect(isOutboxItemDue({ timestamp: NOW, held: true }, NOW, true)).toBe(false);
  });
});

describe('time limit on a send (FO-07)', () => {
  it('a stuck send fails after the limit', async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 10, 'Sending fuel')).rejects.toBeInstanceOf(OutboxTimeoutError);
  });

  it('a quick send passes through', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe('phone report (S1)', () => {
  it('counts items, oldest photo time, newest error', () => {
    const report = buildOutboxReport([
      { timestamp: Date.parse('2026-11-25T12:03:00Z'), lastError: 'no signal' },
      { timestamp: Date.parse('2026-11-24T23:48:00Z') },
      { timestamp: Date.parse('2026-11-25T12:05:00Z'), lastError: 'signal too weak' },
    ]);
    expect(report).toEqual({
      pendingCount: 3,
      oldestPendingAt: '2026-11-24T23:48:00.000Z',
      lastError: 'signal too weak',
    });
  });

  it('nothing waiting = zero and no time', () => {
    expect(buildOutboxReport([])).toEqual({ pendingCount: 0, oldestPendingAt: null, lastError: null });
  });
});

describe('plain error words', () => {
  it('turns network errors into words a driver understands', () => {
    expect(plainSendError(new TypeError('Failed to fetch'))).toBe('no signal');
    expect(plainSendError(new OutboxTimeoutError('Sending', 90_000))).toBe('signal too weak');
    expect(plainSendError(new Error('Week already closed'))).toBe('Week already closed');
  });
});
