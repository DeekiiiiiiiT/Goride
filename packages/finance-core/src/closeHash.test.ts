import { describe, expect, it } from 'vitest';
import {
  buildCloseHash,
  buildPeriodCloseHashPayload,
  storedCloseHashFromPeriod,
  verifyPeriodCloseHash,
} from './closeHash';

describe('verifyPeriodCloseHash (H-4)', () => {
  const row = {
    tollSpend: 100,
    fuelDeduction: 50,
    settlementAmount: -20,
    cashCollected: 200,
  };

  it('ok when stored matches recomputed hash', async () => {
    const payload = buildPeriodCloseHashPayload({
      row,
      sourceRowIds: ['a', 'b'],
      engineVersion: 'period-close@1',
    });
    const hash = await buildCloseHash(payload);
    const result = await verifyPeriodCloseHash({
      row,
      storedHash: hash,
      sourceRowIds: ['b', 'a'],
      engineVersion: 'period-close@1',
    });
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(hash);
  });

  it('fails when money fields change', async () => {
    const payload = buildPeriodCloseHashPayload({
      row,
      sourceRowIds: [],
      engineVersion: 'period-close@1',
    });
    const hash = await buildCloseHash(payload);
    const result = await verifyPeriodCloseHash({
      row: { ...row, settlementAmount: 999 },
      storedHash: hash,
      sourceRowIds: [],
      engineVersion: 'period-close@1',
    });
    expect(result.ok).toBe(false);
    expect(result.expected).not.toBe(hash);
  });

  it('reports missingStored when no hash', async () => {
    const result = await verifyPeriodCloseHash({ row, storedHash: null });
    expect(result.ok).toBe(false);
    expect(result.missingStored).toBe(true);
  });

  it('storedCloseHashFromPeriod prefers close_hash → metadata → source_event_hash', () => {
    expect(
      storedCloseHashFromPeriod({
        close_hash: 'dedicated',
        source_event_hash: 'legacy',
        metadata: { financeCore: { closeHash: 'meta' } },
      }),
    ).toBe('dedicated');
    expect(
      storedCloseHashFromPeriod({
        closeHash: 'camelDedicated',
        source_event_hash: 'legacy',
        metadata: { financeCore: { closeHash: 'meta' } },
      }),
    ).toBe('camelDedicated');
    expect(
      storedCloseHashFromPeriod({
        source_event_hash: 'legacy',
        metadata: { financeCore: { closeHash: 'meta' } },
      }),
    ).toBe('meta');
    expect(
      storedCloseHashFromPeriod({ source_event_hash: 'abc' }),
    ).toBe('abc');
    expect(
      storedCloseHashFromPeriod({
        metadata: { financeCore: { closeHash: 'meta' } },
      }),
    ).toBe('meta');
  });
});
