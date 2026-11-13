import { describe, expect, it, vi } from 'vitest';
import { formatConfirmAllSureToast, runConfirmAllSure } from './useTollV2Commands';

describe('runConfirmAllSure', () => {
  it('continues after a thrown error on one row', async () => {
    let n = 0;
    const runCommand = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error('network');
      return {};
    });
    const rows = [
      { chargeId: 'a', chargeVersion: 1, suggestionId: 's1', paybackVersion: 1 },
      { chargeId: 'b', chargeVersion: 1, suggestionId: 's2', paybackVersion: 1 },
      { chargeId: 'c', chargeVersion: 1, suggestionId: 's3', paybackVersion: 1 },
    ];
    const counts = await runConfirmAllSure(runCommand, rows);
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(counts).toEqual({ matched: 2, changed: 0, failed: 1 });
  });

  it('counts VERSION_CHANGED as changed', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({});
    const rows = [
      { chargeId: 'a', chargeVersion: 1, suggestionId: 's1', paybackVersion: 1 },
      { chargeId: 'b', chargeVersion: 1, suggestionId: 's2', paybackVersion: 1 },
      { chargeId: 'c', chargeVersion: 1, suggestionId: 's3', paybackVersion: 1 },
    ];
    const counts = await runConfirmAllSure(runCommand, rows);
    expect(counts).toEqual({ matched: 2, changed: 1, failed: 0 });
  });
});

describe('formatConfirmAllSureToast', () => {
  it('omits zero changed and failed', () => {
    expect(formatConfirmAllSureToast({ matched: 4, changed: 0, failed: 0 })).toBe(
      '4 matched — list refreshed',
    );
  });

  it('includes non-zero changed and failed', () => {
    expect(formatConfirmAllSureToast({ matched: 4, changed: 1, failed: 0 })).toBe(
      '4 matched · 1 changed — list refreshed',
    );
    expect(formatConfirmAllSureToast({ matched: 3, changed: 1, failed: 2 })).toBe(
      '3 matched · 1 changed · 2 failed — list refreshed',
    );
  });
});
