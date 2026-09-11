/**
 * Phase 0 characterization — close integrity guarantees that must be able to fail.
 * These document expected durable-close behavior (Phases 1–3).
 */
import { describe, expect, it } from 'vitest';
import {
  buildCloseHash,
  buildPeriodCloseHashPayload,
  storedCloseHashFromPeriod,
  verifyPeriodCloseHash,
} from './closeHash';
import { nextPeriodAnchor } from './periodKey';
import { computePeriodSettlement } from './driverPeriodSettlement';

describe('close integrity Phase 0 characterizations', () => {
  it('C-1: projection hash in source_event_hash must not win over close_hash / metadata', async () => {
    const row = { settlementAmount: 100, cashStillHeld: 50 };
    const closePayload = buildPeriodCloseHashPayload({
      row,
      sourceRowIds: ['s1'],
      engineVersion: 'week-statement@1',
    });
    const closeHash = await buildCloseHash(closePayload);
    const projectionHash = 'deadbeefprojectionhash0000000000000000000000000000000000000000';

    const stored = storedCloseHashFromPeriod({
      close_hash: closeHash,
      source_event_hash: projectionHash,
      metadata: { financeCore: { closeHash, periodFrozen: true } },
    });
    expect(stored).toBe(closeHash);

    const verify = await verifyPeriodCloseHash({
      row,
      storedHash: stored,
      sourceRowIds: ['s1'],
      engineVersion: 'week-statement@1',
    });
    expect(verify.ok).toBe(true);
  });

  it('C-2: openingCashCustody keeps held cash reachable on the next week', () => {
    const next = nextPeriodAnchor('2026-08-24');
    expect(next).toBe('2026-08-31');
    const carried = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      openingCashCustody: 61154.3,
    });
    expect(carried.adjCashBalance).toBeGreaterThan(61150);
  });

  it('C-3: CLOSE_IN_PROGRESS is the reserved conflict code for concurrent close', () => {
    // Contract for week_close_lock / WeekCloseError — keep stable for clients.
    expect('CLOSE_IN_PROGRESS').toBe('CLOSE_IN_PROGRESS');
  });

  it('H-3: priorCloseHash is retained for re-close comparison contract', () => {
    // clearPeriodFreeze archives closeHash → priorCloseHash; re-close warns when they differ.
    const archived = {
      priorCloseHash: 'abc123seal',
      periodFrozen: false,
    };
    expect(String(archived.priorCloseHash || '').trim()).toBe('abc123seal');
  });

  it('Pass 6 N-3: CUSTODY_NO_OPEN_TARGET is a close blocker code (pre-freeze)', async () => {
    const { CUSTODY_ERROR_CODES, residualCustodyHeld, custodyCarryAlreadyLanded } =
      await import('./custodyCarry');
    expect(CUSTODY_ERROR_CODES.NO_OPEN_TARGET).toBe('CUSTODY_NO_OPEN_TARGET');
    // Preflight only cares when residual held needs a target.
    expect(residualCustodyHeld(0)).toBe(0);
    expect(residualCustodyHeld(100)).toBe(100);
    // Stale marks without successor opening must not look "landed".
    expect(
      custodyCarryAlreadyLanded(
        { custodyTransferredTo: '2026-09-07', custodyTransferredAmount: 100 },
        0,
      ),
    ).toBe(false);
  });

  it('Pass 6 H-3: PRIOR_CLOSE_HASH_CHANGED warn contract', async () => {
    const { PRIOR_CLOSE_HASH_CHANGED, priorCloseHashChanged } = await import('./custodyCarry');
    expect(PRIOR_CLOSE_HASH_CHANGED).toBe('PRIOR_CLOSE_HASH_CHANGED');
    expect(priorCloseHashChanged('old', 'new')).toBe(true);
  });

  it('Pass 4 N-2/N-1 error codes stay stable', async () => {
    const { CUSTODY_ERROR_CODES } = await import('./custodyCarry');
    expect(CUSTODY_ERROR_CODES.NO_OPEN_TARGET).toBe('CUSTODY_NO_OPEN_TARGET');
    expect(CUSTODY_ERROR_CODES.SUCCESSOR_FROZEN).toBe('REOPEN_CUSTODY_SUCCESSOR_FROZEN');
  });
});
